"use server";

import { revalidatePath } from "next/cache";
import { retrieveContext, saveDraft } from "@/lib/db/assistant";
import { generateAnswer } from "@/lib/ai/answer";
import type { ExtractionFields, FieldKey } from "@/lib/ai/extract";

const ACTOR = "오현미"; // TODO: 로그인(Supabase Auth) 도입 시 세션 사용자로 교체

export interface AnswerSource {
  conversation_id: string;
  excerpt: string;
  used: boolean; // 모델이 근거로 명시한 출처인지
}

export interface AnswerActionResult {
  ok: boolean;
  message: string;
  answer?: string;
  fields?: ExtractionFields;
  confidence?: Record<FieldKey, number>;
  sources?: AnswerSource[];
  matchedTotal?: number; // 검색된 전체 후보 수(은닉 truncation 방지 표기)
}

// 상담 문의(질문) → 과거 기록 검색 → 1차 답변 생성 → 기록 후 반환.
export async function generateAnswerAction(
  question: string,
): Promise<AnswerActionResult> {
  const q = question.trim();
  if (!q) return { ok: false, message: "상담 문의(질문)를 입력해 주세요." };

  try {
    const ctx = await retrieveContext(q);
    const result = await generateAnswer(q, ctx);

    // 출처 정리: 검색 스니펫 + 모델이 사용했다고 표시한 id 표시.
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

    await saveDraft({
      question: q,
      answerDraft: result.answer_draft,
      extracted: result.fields,
      confidence: result.confidence,
      usedSources: sources
        .filter((s) => s.used)
        .map((s) => ({ conversation_id: s.conversation_id, excerpt: s.excerpt })),
      model: result.model,
      byName: ACTOR,
    });

    revalidatePath("/assistant");
    return {
      ok: true,
      message: "1차 답변 생성 완료",
      answer: result.answer_draft,
      fields: result.fields,
      confidence: result.confidence,
      sources,
      matchedTotal: ctx.total,
    };
  } catch (e) {
    return { ok: false, message: `답변 생성 실패: ${(e as Error).message}` };
  }
}
