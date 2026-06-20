// 논사원 1차 답변 — 검색(기억) 계층.
//   과거 상담 기록에서 키워드(pg_trgm)로 답변 근거를 찾고, 생성된 답변을 기록한다.
//   원본 기록(parsed_messages/ai_training_data/conversation_extractions)은 읽기만 한다.
import { sql, resolveAgentId } from "./client";
import type { ExtractionFields, FieldKey } from "@/lib/ai/extract";

// 검색에서 무시할 흔한 조사/군말(키워드 추출 노이즈 제거용)
const STOPWORDS = new Set([
  "그리고", "해서", "해주세요", "주세요", "합니다", "입니다", "에서", "으로", "까지",
  "부터", "근데", "그래서", "제가", "저는", "저희", "관련", "문의", "안녕하세요", "부탁",
  "부탁드립니다", "있나요", "될까요", "가능", "가능할까요", "얼마", "있을까요",
]);

// 질문 → 검색 키워드(공백 분해 + 기호 제거 + 짧은말/조사 제거, 최대 12개)
export function keywords(question: string): string[] {
  return Array.from(
    new Set(
      question
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 12);
}

export interface ContextSnippet {
  conversation_id: string;
  conversation_title: string | null;
  sender_type: string; // staff | customer | system
  sender_name: string | null;
  content: string;
  score: number; // 질문과의 trigram 유사도(0~1)
}

export interface QaExample {
  conversation_id: string | null;
  question: string; // 과거 고객 발화(input_text)
  answer: string; // 과거 직원 응답(output_text)
  score: number;
}

export interface ExtractionSummary {
  conversation_id: string;
  fields: Partial<ExtractionFields>;
}

export interface RetrievedContext {
  query: string;
  keywords: string[];
  snippets: ContextSnippet[]; // 관련 과거 메시지(직원 응답 우선)
  examples: QaExample[]; // 과거 (질문→답변) 쌍
  extractions: ExtractionSummary[]; // 관련 대화의 구조화 배차항목
  total: number; // 상한 적용 전 후보 수(은닉 truncation 방지용 표기)
  limit: number;
}

// 과거 상담 기록에서 질문 관련 근거를 모은다.
//   parsed_messages: 키워드 ILIKE(GIN trgm 가속) 매칭 → 질문과 trigram 유사도순.
//                    직원(staff) 응답에 가중치(답변 근거로 가장 유용).
export async function retrieveContext(
  question: string,
  limit = 8,
): Promise<RetrievedContext> {
  const kw = keywords(question);
  const q = question.trim();
  // 키워드가 하나도 없으면(예: 기호만) 질문 원문으로 trigram 매칭만 시도.
  const patterns = kw.length > 0 ? kw.map((k) => `%${k}%`) : [`%${q}%`];

  // ── 관련 메시지(snippets) ──────────────────────────────────────────
  // 직원 응답 0.15 가중. 매칭 후보 전체 수(total)도 함께 센다.
  // 비활성화(삭제)된 대화는 conversations.is_active 로 제외한다.
  const snippetRows = await sql<
    (Omit<ContextSnippet, "score"> & { score: number; total: number })[]
  >`
    with matched as (
      select p.conversation_id, p.sender_type, p.sender_name, p.content,
             c.title as conversation_title,
             similarity(p.content, ${q})
               + case when p.sender_type = 'staff' then 0.15 else 0 end as score
      from parsed_messages p
      join conversations c on c.id = p.conversation_id and c.is_active
      where p.content is not null
        and p.content ilike any(${patterns})
    )
    select m.*, count(*) over () as total
    from matched m
    order by m.score desc
    limit ${limit}`;

  const total = snippetRows[0]?.total ?? 0;
  const snippets: ContextSnippet[] = snippetRows.map((r) => ({
    conversation_id: r.conversation_id,
    conversation_title: r.conversation_title ?? null,
    sender_type: r.sender_type,
    sender_name: r.sender_name ?? null,
    content: r.content,
    score: Number(r.score),
  }));

  // ── 과거 질문→답변 쌍(examples) ────────────────────────────────────
  const exampleRows = await sql<QaExample[]>`
    select t.conversation_id,
           t.input_text  as question,
           t.output_text as answer,
           similarity(coalesce(t.input_text, ''), ${q}) as score
    from ai_training_data t
    join conversations c on c.id = t.conversation_id and c.is_active
    where t.is_active and t.kind = 'qa_pair'
      and t.input_text is not null
      and t.input_text ilike any(${patterns})
    order by score desc
    limit ${Math.max(3, Math.floor(limit / 2))}`;
  const examples = exampleRows.map((r) => ({ ...r, score: Number(r.score) }));

  // ── 관련 대화의 구조화 배차항목(extractions) ───────────────────────
  const convIds = Array.from(new Set(snippets.map((s) => s.conversation_id)));
  let extractions: ExtractionSummary[] = [];
  if (convIds.length > 0) {
    const extRows = await sql<
      (Partial<Record<FieldKey, string | boolean | null>> & { conversation_id: string })[]
    >`
      select conversation_id, client_name, manager_name, phone, origin, destination,
             vehicle_type, consultation_type, is_urgent
      from conversation_extractions
      where is_active and conversation_id = any(${convIds})`;
    extractions = extRows.map(({ conversation_id, ...fields }) => ({
      conversation_id,
      fields: fields as Partial<ExtractionFields>,
    }));
  }

  return { query: q, keywords: kw, snippets, examples, extractions, total, limit };
}

// ── 생성된 1차 답변 기록(기억) ────────────────────────────────────────
export interface SaveDraftInput {
  question: string;
  answerDraft: string;
  extracted: ExtractionFields;
  confidence: Record<string, number>;
  usedSources: { conversation_id: string; excerpt: string }[];
  model: string;
  byName?: string;
}

export async function saveDraft(input: SaveDraftInput): Promise<string> {
  const by = await resolveAgentId(input.byName);
  const [row] = await sql<{ id: string }[]>`
    insert into assistant_drafts
      (question, answer_draft, extracted, confidence, used_sources, ai_model,
       status, created_by, updated_by)
    values (${input.question}, ${input.answerDraft},
            ${sql.json({ ...input.extracted } as Record<string, string | boolean | null>)},
            ${sql.json(input.confidence)},
            ${sql.json(input.usedSources)}, ${input.model},
            'draft', ${by}, ${by})
    returning id`;
  return row.id;
}

export interface DraftListItem {
  id: string;
  question: string;
  answer_draft: string | null;
  status: string;
  created_by_name: string | null;
  created_at: string;
}

export async function listRecentDrafts(limit = 10): Promise<DraftListItem[]> {
  const rows = await sql<(Omit<DraftListItem, "created_at"> & { created_at: Date })[]>`
    select d.id, d.question, d.answer_draft, d.status, d.created_at,
           a.name as created_by_name
    from assistant_drafts d
    left join agents a on a.id = d.created_by
    where d.is_active
    order by d.created_at desc
    limit ${limit}`;
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}
