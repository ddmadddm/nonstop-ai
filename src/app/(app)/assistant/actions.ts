"use server";

import { revalidatePath } from "next/cache";
import {
  retrieveContext,
  saveDraft,
  updateDraftAnswer,
  findClientInText,
  saveProspect,
} from "@/lib/db/assistant";
import { generateAnswer, normalizeAnswerText } from "@/lib/ai/answer";
import { getClientKnowledge, type ClientKnowledge } from "@/lib/db/knowledge";
import { getClient, searchClients, type ClientSearchHit } from "@/lib/db/clients";
import { resolveAddressPair } from "@/lib/db/addresses";
import { getFaqs } from "@/lib/data";
import { getActorName } from "@/lib/auth";
import type { Faq } from "@/lib/types";
import type {
  ClientMode,
  ResolvedMode,
  Recognition,
  AnswerSource,
  AnswerActionResult,
} from "./types";

// 타입/상수(MODE_LABEL)는 ./types 로 이동했다.
//   "use server" 파일은 async 함수만 export 할 수 있어 객체 상수를 둘 수 없다.

function renderKnowledge(name: string, k: ClientKnowledge): string {
  const list = (arr: { value: string; count: number }[]) =>
    arr.slice(0, 5).map((x) => `${x.value}(${x.count})`).join(", ") || "-";
  const mgr =
    k.managers.slice(0, 3).map((m) => `${m.name ?? "-"}${m.phone ? "/" + m.phone : ""}`).join(", ") ||
    "-";
  return (
    `거래처 '${name}' 누적 패턴 — 자주 출발지: ${list(k.origins)}; 자주 도착지: ${list(k.destinations)}; ` +
    `자주 차종: ${list(k.vehicles)}; 담당자: ${mgr}; 집계 상담 ${k.total}건.`
  );
}

async function matchFaqs(q: string): Promise<Faq[]> {
  const all = await getFaqs();
  return all
    .map((f) => ({ f, hits: f.keywords.filter((k) => q.includes(k)).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((s) => s.f);
}
function renderFaqs(faqs: Faq[]): string | null {
  if (faqs.length === 0) return null;
  return faqs.map((f, i) => `FAQ${i + 1}\n  Q: ${f.question}\n  A: ${f.answer}`).join("\n");
}

// 상담 문의(질문) → 거래처 구분(자동/수동) → 근거 우선순위 → 1차 답변 생성.
// 거래처 검색(논사원 주거래처 선택용) — 거래처명/담당자/연락처
export async function searchClientsAction(query: string): Promise<ClientSearchHit[]> {
  return searchClients(query);
}

export async function generateAnswerAction(
  question: string,
  requestedMode: ClientMode = "auto",
  selectedClientId?: string | null,
): Promise<AnswerActionResult> {
  const q = question.trim();
  if (!q) return { ok: false, message: "상담 문의(질문)를 입력해 주세요." };

  try {
    const actor = (await getActorName()) ?? undefined;

    // 1) 거래처 인식 — 직원이 직접 지정한 거래처가 있으면 우선(수동 변경), 없으면 질문에서 자동 매칭.
    let matched = await findClientInText(q);
    if (selectedClientId) {
      const c = await getClient(selectedClientId);
      if (c) matched = { id: c.id, name: c.name, how: "manual", score: 1 };
    }

    // 2) 근거 우선순위 결정
    //    주거래처(매칭 또는 수동 주거래처) → 지식베이스 우선. 그 외 → FAQ + 과거 상담.
    const useKnowledge =
      !!matched && (requestedMode === "key_client" || requestedMode === "auto");
    const wantFaq =
      requestedMode === "general" ||
      requestedMode === "new_candidate" ||
      (requestedMode === "auto" && !matched);

    const ctx = await retrieveContext(q);
    const knowledgeText =
      useKnowledge && matched
        ? (await getClientKnowledge(matched.id).then((k) =>
            k ? renderKnowledge(matched.name, k) : null,
          ))
        : null;
    const faqs = wantFaq ? await matchFaqs(q) : [];
    const faqText = renderFaqs(faqs);

    const modeHint = useKnowledge
      ? `주거래처(${matched!.name}) — 지식베이스 우선`
      : wantFaq
        ? "일반/신규 — FAQ·과거 상담 우선"
        : null;

    // 3) 답변 생성
    const result = await generateAnswer(q, ctx, { knowledgeText, faqText, modeHint });
    const f = result.fields;

    // 3-1) 출발/도착지 주소 변환(신/구/가격표) — 직원 확인용 내부 정보. best-effort.
    const addressConversion = await resolveAddressPair(f.origin, f.destination).catch(() => null);

    // 4) 최종 구분(자동판단이면 추출 결과로 재분류)
    let resolvedMode: ResolvedMode;
    if (requestedMode !== "auto") {
      resolvedMode = requestedMode;
    } else if (matched) {
      resolvedMode = "key_client";
    } else if (f.client_name || f.phone) {
      resolvedMode = "new_candidate";
    } else {
      resolvedMode = "general";
    }

    // 5) 신규 후보 저장
    let prospectSaved = false;
    if (resolvedMode === "new_candidate" && (f.client_name || f.phone)) {
      await saveProspect({
        name: f.client_name,
        manager_name: f.manager_name,
        phone: f.phone,
        origin: f.origin,
        destination: f.destination,
        question: q,
        byName: actor,
      });
      prospectSaved = true;
    }

    // 6) 출처 정리
    const usedSet = new Set(result.used_source_ids);
    const seen = new Set<string>();
    const sources: AnswerSource[] = [];
    for (const s of ctx.snippets) {
      if (seen.has(s.conversation_id)) continue;
      seen.add(s.conversation_id);
      sources.push({
        conversation_id: s.conversation_id,
        excerpt: s.content.length > 120 ? s.content.slice(0, 120) + "…" : s.content,
        used: usedSet.has(s.conversation_id),
      });
    }

    // 7) 인식 신뢰도
    const confidence = matched
      ? matched.how === "manual"
        ? 1
        : matched.how === "phone"
          ? 0.95
          : 0.85
      : resolvedMode === "new_candidate"
        ? 0.5
        : 0.3;

    const draftId = await saveDraft({
      question: q,
      answerDraft: result.answer_draft,
      extracted: result.fields,
      confidence: result.confidence,
      usedSources: sources
        .filter((s) => s.used)
        .map((s) => ({ conversation_id: s.conversation_id, excerpt: s.excerpt })),
      model: result.model,
      byName: actor,
      requestedMode,
      clientMode: resolvedMode,
      recognizedClientId: matched?.id ?? null,
      recognitionConfidence: confidence,
      clientName: matched?.name ?? f.client_name,
      managerName: f.manager_name,
      phone: f.phone,
      addressConversion,
    });

    // 8) 근거 라벨
    const basis: string[] = [];
    if (resolvedMode === "key_client" && knowledgeText) basis.push(`거래처 지식베이스(${matched!.name})`);
    if (faqText) basis.push(`FAQ ${faqs.length}건`);
    if (prospectSaved) basis.push("신규 거래처 후보로 저장");
    basis.push(`과거 상담 ${sources.length}건`);

    const recognition: Recognition = {
      requestedMode,
      resolvedMode,
      auto: requestedMode === "auto",
      matchedClientId: matched?.id ?? null,
      matchedClientName: matched?.name ?? null,
      matchType: matched?.how ?? null,
      confidence,
      extracted: {
        client_name: f.client_name,
        manager_name: f.manager_name,
        phone: f.phone,
        origin: f.origin,
        destination: f.destination,
      },
      prospectSaved,
    };

    revalidatePath("/assistant");
    return {
      ok: true,
      message: "1차 답변 생성 완료",
      draftId,
      answer: result.answer_draft,
      fields: result.fields,
      confidence: result.confidence,
      sources,
      matchedTotal: ctx.total,
      recognition,
      basis,
      addressConversion,
    };
  } catch (e) {
    return { ok: false, message: `답변 생성 실패: ${(e as Error).message}` };
  }
}

// 상담원이 수정한 1차 답변문 최종본을 저장(기억)한다.
//   원본 AI 초안은 보존하고 answer_final 에 수정본을 기록, status='edited'.
export async function saveAnswerEditAction(
  draftId: string,
  answer: string,
): Promise<{ ok: boolean; message: string }> {
  const text = normalizeAnswerText(answer); // 저장본도 "한 문장 = 한 줄" 동일 규칙 적용
  if (!draftId) return { ok: false, message: "저장할 답변 기록을 찾지 못했습니다." };
  if (!text) return { ok: false, message: "답변 내용을 입력해 주세요." };
  try {
    const actor = (await getActorName()) ?? undefined;
    const ok = await updateDraftAnswer(draftId, text, actor);
    if (!ok) return { ok: false, message: "답변 기록을 찾지 못했습니다." };
    revalidatePath("/assistant");
    revalidatePath(`/assistant/${draftId}`);
    return { ok: true, message: "수정한 답변을 저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}
