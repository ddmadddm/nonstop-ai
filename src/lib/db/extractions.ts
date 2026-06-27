// conversation_extractions 접근 계층 — AI 자동추출 + 직원 수정 + 변경이력.
//   원본(raw_messages)은 건드리지 않는다. parsed_messages 에서 대화 원문을 만들어 AI에 넘긴다.
import { sql, resolveAgentId } from "./client";
import { promoteConversationTraining } from "./training";
import {
  extractConsultation,
  FIELD_KEYS,
  type ExtractionFields,
  type FieldKey,
} from "@/lib/ai/extract";

// 세그먼트 미지정(대화 단위) 추출을 유일 인덱스에서 정규화하는 제로 UUID.
const NULL_SEGMENT = "00000000-0000-0000-0000-000000000000";

export interface Extraction extends ExtractionFields {
  id: string;
  conversation_id: string;
  segment_id: string | null;
  ai_confidence: Record<string, number> | null;
  ai_extracted: Record<string, unknown> | null;
  ai_model: string | null;
  field_sources: Record<string, "ai" | "human">;
  status: "pending" | "extracted" | "edited" | "confirmed" | "failed";
  needs_review: boolean;
  review_reasons: string[] | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

// 검수 규칙(요구사항): ① 신뢰도 70% 미만 ② 출발지/도착지/차량종류 누락 → 검수필수
export const CONFIDENCE_THRESHOLD = 0.7;
const REQUIRED_FIELDS: FieldKey[] = ["origin", "destination", "vehicle_type"];
const FIELD_LABELS: Record<FieldKey, string> = {
  client_name: "거래처명",
  manager_name: "담당자명",
  phone: "연락처",
  origin: "출발지",
  destination: "도착지",
  vehicle_type: "차량종류",
  consultation_type: "상담유형",
  is_urgent: "긴급여부",
};

function avgConfidence(confidence: Record<string, number>): number {
  const vals = FIELD_KEYS.map((k) => confidence[k] ?? 0);
  return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
}

// 검수필수 여부 + 사유 계산. human 으로 고친 필드는 신뢰도 검사에서 제외(직원이 확인한 값).
function computeReview(
  fields: ExtractionFields,
  confidence: Record<string, number>,
  sources: Record<string, "ai" | "human">,
): { needs_review: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const k of REQUIRED_FIELDS) {
    if (fields[k] == null || fields[k] === "") reasons.push(`${FIELD_LABELS[k]} 없음`);
  }
  for (const k of FIELD_KEYS) {
    if (fields[k] == null) continue;
    if (sources[k] === "human") continue;
    const c = confidence[k] ?? 0;
    if (c < CONFIDENCE_THRESHOLD) {
      reasons.push(`신뢰도 낮음: ${FIELD_LABELS[k]}(${Math.round(c * 100)}%)`);
    }
  }
  return { needs_review: reasons.length > 0, reasons };
}

type ExtractionRow = Omit<Extraction, "reviewed_at" | "updated_at"> & {
  reviewed_at: Date | null;
  updated_at: Date;
};

function mapExtraction(r: ExtractionRow): Extraction {
  return {
    ...r,
    reviewed_at: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    updated_at: r.updated_at.toISOString(),
  };
}

export async function getExtraction(
  conversationId: string,
  segmentId: string | null = null,
): Promise<Extraction | null> {
  const rows = await sql<ExtractionRow[]>`
    select e.id, e.conversation_id, e.segment_id,
           e.client_name, e.manager_name, e.phone, e.origin, e.destination,
           e.vehicle_type, e.consultation_type, e.is_urgent,
           e.ai_confidence, e.ai_extracted, e.ai_model, e.field_sources,
           e.status, e.needs_review, e.review_reasons,
           e.reviewed_at, e.updated_at, a.name as reviewed_by_name
    from conversation_extractions e
    left join agents a on a.id = e.reviewed_by
    where e.conversation_id = ${conversationId} and e.is_active
      and e.segment_id is not distinct from ${segmentId}`;
  return rows[0] ? mapExtraction(rows[0]) : null;
}

// 대화 원문(parsed_messages) → 직원/고객 라벨이 붙은 트랜스크립트.
//   range 지정 시 해당 세그먼트 구간(seq)만 추출 대상으로 한다.
export async function getTranscript(
  conversationId: string,
  range?: { startSeq: number; endSeq: number },
): Promise<{
  messages: { sender_type: string; sender_name: string | null; content: string | null; sent_at: string | null }[];
  text: string;
}> {
  const rows = await sql<
    { sender_type: string; sender_name: string | null; content: string | null; sent_at: Date | null }[]
  >`
    select sender_type, sender_name, content, sent_at
    from parsed_messages
    where conversation_id = ${conversationId}
      ${range ? sql`and seq between ${range.startSeq} and ${range.endSeq}` : sql``}
    order by seq`;
  // 세그먼트 구간이 비었으면 빈 결과(원본 보존, 변환텍스트 대체는 대화 단위에서만).
  if (rows.length === 0 && range) return { messages: [], text: "" };
  // parsed_messages 가 없는 대화(오디오 STT·이미지/PDF OCR)는 변환 텍스트로 대체.
  if (rows.length === 0) {
    const [mat] = await sql<{ converted_text: string | null }[]>`
      select converted_text from consultation_materials
      where conversation_id = ${conversationId} and is_active
      order by created_at desc limit 1`;
    const text = (mat?.converted_text ?? "").trim();
    const messages = text
      ? [{ sender_type: "customer", sender_name: null, content: text, sent_at: null }]
      : [];
    return { messages, text };
  }

  const messages = rows.map((r) => ({
    sender_type: r.sender_type,
    sender_name: r.sender_name,
    content: r.content,
    sent_at: r.sent_at ? r.sent_at.toISOString() : null,
  }));
  const text = rows
    .map((r) => {
      const who = r.sender_type === "staff" ? "직원" : "고객";
      const name = r.sender_name ? `/${r.sender_name}` : "";
      return `[${who}${name}] ${r.content ?? ""}`;
    })
    .join("\n");
  return { messages, text };
}

// AI 추출 실행(최초/재추출). 직원이 고친 필드('human')는 덮어쓰지 않는다.
//   opts.segmentId/range 지정 시 해당 상담 단위(세그먼트) 구간만 추출한다(⑥).
export async function runExtraction(
  conversationId: string,
  byName?: string,
  opts?: { segmentId?: string | null; range?: { startSeq: number; endSeq: number } },
): Promise<Extraction> {
  const segmentId = opts?.segmentId ?? null;
  const { text } = await getTranscript(conversationId, opts?.range);
  if (!text.trim()) throw new Error("대화 내용이 없습니다.");
  const by = await resolveAgentId(byName);
  const startedAt = Date.now();

  let result;
  try {
    result = await extractConsultation(text);
  } catch (e) {
    const msg = (e as Error).message;
    // 실패: 추출만 실패 상태(원본/대화는 보존). 업로드는 영향 없음(상위에서 성공 처리).
    await sql`
      insert into conversation_extractions (conversation_id, segment_id, status, error, needs_review, created_by, updated_by)
      values (${conversationId}, ${segmentId}, 'failed', ${msg}, true, ${by}, ${by})
      on conflict (conversation_id, coalesce(segment_id, ${NULL_SEGMENT}::uuid)) where is_active
      do update set status='failed', error=${msg}, needs_review=true, updated_by=${by}`;
    // 추출 로그
    await sql`
      insert into extraction_logs (conversation_id, status, duration_ms, error, created_by)
      values (${conversationId}, 'failed', ${Date.now() - startedAt}, ${msg}, ${by})`;
    throw e;
  }

  const existing = await getExtraction(conversationId, segmentId);
  const sources: Record<string, "ai" | "human"> = { ...(existing?.field_sources ?? {}) };
  const merged: ExtractionFields = { ...result.fields };

  // 기존에 직원이 고친 필드는 유지(재추출이 사람 수정을 덮어쓰지 않음)
  for (const k of FIELD_KEYS) {
    if (existing && sources[k] === "human") {
      (merged as Record<FieldKey, unknown>)[k] = existing[k];
    } else {
      sources[k] = "ai";
    }
  }

  const review = computeReview(merged, result.confidence, sources);
  const avg = avgConfidence(result.confidence);

  if (existing) {
    await sql`
      update conversation_extractions set
        client_name=${merged.client_name}, manager_name=${merged.manager_name},
        phone=${merged.phone}, origin=${merged.origin}, destination=${merged.destination},
        vehicle_type=${merged.vehicle_type}, consultation_type=${merged.consultation_type},
        is_urgent=${merged.is_urgent},
        ai_extracted=${sql.json({ ...result.fields } as Record<string, string | boolean | null>)}, ai_confidence=${sql.json(result.confidence)},
        ai_model=${result.model}, field_sources=${sql.json(sources)},
        needs_review=${review.needs_review}, review_reasons=${sql.json(review.reasons)},
        status='extracted', error=null, updated_by=${by}
      where conversation_id=${conversationId} and is_active
        and segment_id is not distinct from ${segmentId}`;
  } else {
    await sql`
      insert into conversation_extractions
        (conversation_id, segment_id, client_name, manager_name, phone, origin, destination,
         vehicle_type, consultation_type, is_urgent,
         ai_extracted, ai_confidence, ai_model, field_sources,
         needs_review, review_reasons, status, created_by, updated_by)
      values
        (${conversationId}, ${segmentId}, ${merged.client_name}, ${merged.manager_name}, ${merged.phone},
         ${merged.origin}, ${merged.destination}, ${merged.vehicle_type},
         ${merged.consultation_type}, ${merged.is_urgent},
         ${sql.json({ ...result.fields } as Record<string, string | boolean | null>)}, ${sql.json(result.confidence)}, ${result.model},
         ${sql.json(sources)}, ${review.needs_review}, ${sql.json(review.reasons)},
         'extracted', ${by}, ${by})`;
  }

  await sql`
    insert into extraction_logs
      (conversation_id, status, model, duration_ms, avg_confidence, needs_review, result, created_by)
    values
      (${conversationId}, 'success', ${result.model}, ${Date.now() - startedAt}, ${avg},
       ${review.needs_review},
       ${sql.json({ fields: result.fields, confidence: result.confidence } as unknown as Parameters<typeof sql.json>[0])},
       ${by})`;

  return (await getExtraction(conversationId, segmentId))!;
}

// 세그먼트(상담 단위) 온디맨드 추출 — 해당 구간만 AI 추출(⑥).
export async function runSegmentExtraction(
  conversationId: string,
  segmentId: string,
  startSeq: number,
  endSeq: number,
  byName?: string,
): Promise<Extraction> {
  return runExtraction(conversationId, byName, { segmentId, range: { startSeq, endSeq } });
}

// 직원 수정 저장. 변경이력은 fn_audit 트리거가 audit_logs 에 자동 기록.
export async function saveExtractionEdits(
  conversationId: string,
  edits: ExtractionFields,
  byName?: string,
): Promise<Extraction> {
  const existing = await getExtraction(conversationId);
  if (!existing) throw new Error("추출 결과가 없습니다. 먼저 AI 추출을 실행하세요.");
  const by = await resolveAgentId(byName);

  // AI 원본과 다른 값 → 'human' 출처로 표시
  const ai = (existing.ai_extracted ?? {}) as Partial<ExtractionFields>;
  const sources: Record<string, "ai" | "human"> = { ...existing.field_sources };
  for (const k of FIELD_KEYS) {
    const changed = (edits[k] ?? null) !== ((ai[k] as unknown) ?? null);
    if (changed) sources[k] = "human";
  }

  // 수정 후 검수필수 재계산(필수항목 채워졌는지 / 남은 AI 필드 신뢰도)
  const review = computeReview(edits, existing.ai_confidence ?? {}, sources);

  await sql`
    update conversation_extractions set
      client_name=${edits.client_name}, manager_name=${edits.manager_name},
      phone=${edits.phone}, origin=${edits.origin}, destination=${edits.destination},
      vehicle_type=${edits.vehicle_type}, consultation_type=${edits.consultation_type},
      is_urgent=${edits.is_urgent},
      field_sources=${sql.json(sources)},
      needs_review=${review.needs_review}, review_reasons=${sql.json(review.reasons)},
      status='edited', updated_by=${by}
    where conversation_id=${conversationId} and is_active`;
  return (await getExtraction(conversationId))!;
}

export async function confirmExtraction(
  conversationId: string,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update conversation_extractions set
      status='confirmed', reviewed_by=${by}, reviewed_at=now(), updated_by=${by}
    where conversation_id=${conversationId} and is_active`;
  // 확정 = 이 대화의 학습 후보(qa_pair·transcript)를 'confirmed'(학습데이터)로 승격.
  await promoteConversationTraining(conversationId, by);
}

// 변경 이력(audit_logs) — 누가 언제 무엇을 바꿨나
export interface HistoryEntry {
  action: string;
  changed_by_name: string | null;
  changed_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
export async function getExtractionHistory(
  extractionId: string,
): Promise<HistoryEntry[]> {
  const rows = await sql<
    { action: string; changed_by_name: string | null; changed_at: Date; before: Record<string, unknown> | null; after: Record<string, unknown> | null }[]
  >`
    select l.action, l.before, l.after, l.changed_at, a.name as changed_by_name
    from audit_logs l
    left join agents a on a.id = l.changed_by
    where l.table_name = 'conversation_extractions' and l.row_id = ${extractionId}
    order by l.changed_at desc`;
  return rows.map((r) => ({ ...r, changed_at: r.changed_at.toISOString() }));
}

// 추출 로그(extraction_logs) — 시도/성공/실패/소요시간/신뢰도
export interface ExtractionLog {
  status: "success" | "failed";
  model: string | null;
  duration_ms: number | null;
  avg_confidence: number | null;
  needs_review: boolean | null;
  error: string | null;
  created_by_name: string | null;
  created_at: string;
}
export async function getExtractionLogs(
  conversationId: string,
): Promise<ExtractionLog[]> {
  const rows = await sql<(Omit<ExtractionLog, "created_at"> & { created_at: Date })[]>`
    select g.status, g.model, g.duration_ms, g.avg_confidence, g.needs_review,
           g.error, g.created_at, a.name as created_by_name
    from extraction_logs g
    left join agents a on a.id = g.created_by
    where g.conversation_id = ${conversationId}
    order by g.created_at desc`;
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}
