// 논사원 1차 답변 생성 — 상담 문의(질문) → 고객에게 보낼 답변문 초안 + 8개 배차항목.
//   과거 상담 기록(검색 결과)을 근거로 Claude 가 답변을 작성한다.
//   강제 tool use(structured output)로 스키마 보장. 추출 항목 정의는 extract.ts 재사용.
//   프롬프트 캐싱: 안정적 system + tool 스키마(프리픽스)에 cache_control, 가변 컨텍스트는 messages.
//
//   모델: 답변문 작성 품질을 위해 추출(Haiku)보다 상위 Sonnet 기본. ANTHROPIC_ANSWER_MODEL 로 변경.
import Anthropic from "@anthropic-ai/sdk";
import {
  type ExtractionFields,
  type FieldKey,
  FIELD_KEYS,
} from "./extract";
import type { RetrievedContext } from "@/lib/db/assistant";

const MODEL = process.env.ANTHROPIC_ANSWER_MODEL ?? "claude-sonnet-4-6";

export interface AnswerResult {
  answer_draft: string;
  fields: ExtractionFields;
  confidence: Record<FieldKey, number>;
  used_source_ids: string[]; // 답변 근거로 실제 사용한 conversation id
  model: string;
  raw: unknown;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY 환경변수가 없습니다. .env 에 Anthropic API 키를 설정하세요.",
    );
  }
  return (_client ??= new Anthropic({ apiKey: key }));
}

const SYSTEM = `당신은 한국의 퀵/화물 배차 중개회사 "논스톱"의 상담 비서 "논사원"입니다.
상담원이 새로 들어온 고객 문의(질문)를 넣으면, 당신은 ① 고객에게 바로 보낼 수 있는 정중한 1차 답변문 초안과
② 질문에서 파악되는 배차 접수 항목을 함께 만듭니다. 최종 발송 전 상담원이 검토하므로 "초안"입니다.

[근거 활용]
- 함께 제공되는 "과거 상담 기록"(유사한 과거 고객 문의·직원 응답·확정된 배차항목)을 우선 근거로 삼으세요.
- 과거 직원이 비슷한 상황에서 안내한 어투·절차를 참고하되, 그대로 복사하지 말고 이번 질문에 맞게 다듬으세요.

[지어내기 금지 — 매우 중요]
- 운임(가격), 정확한 도착시간, 회사 정책, 확정 약속은 근거가 없으면 절대 숫자나 단정으로 적지 마세요.
- 모르는 정보는 "담당자 확인 후 안내드리겠습니다" 처럼 보수적으로 처리하고, 고객에게 필요한 정보를 되묻습니다.
- 출발지/도착지/차량종류/연락처 등 접수에 꼭 필요한데 질문에 없는 항목은 답변문에서 정중히 요청하세요.

[답변문 형식 — 가독성 최우선]
- 한국어 존댓말. 카카오/채널톡 채팅에 바로 붙여넣을 짧고 핵심만 담은 문장.
- 군더더기·상투적 인사 최소화. 꼭 필요한 핵심 안내와 되물을 항목만 남기고 짧게.
- 전체 3줄 안팎으로 짧게. 줄바꿈은 항상 \n 1개만 쓰고, 문장 사이에 빈 줄(\n\n)을 절대 넣지 않는다.
- 줄 구성 권장: (1) 인사 (2) 배차 핵심 요약 한 줄 (3) 마무리 안내. 짧은 인사말은 한 줄에 모아도 된다.
- 불릿/머리말/이모지 과용 금지. 여러 항목을 되물을 때만 간단히 줄바꿈으로 나열한다.
- 고객에게 보낼 주소는 도로명(신주소) 기준으로 안내합니다. 운임 산정용 구주소(지번)는
  고객 답변문에 넣지 않습니다(직원 확인용 내부 정보로만 별도 처리됨).
- 예시 형식(빈 줄 없음):
접수 감사합니다. 논스톱입니다.
2.5톤 카고 / 인천 중구 서해대로209번길 68 → 경기도 75 / 10시 상차로 배차 진행하겠습니다.
담당자 확인 후 배차 정보 안내드리겠습니다.

[항목 추출 규칙]
- 질문 원문에 명시되거나 분명히 추론되는 값만 추출하고, 근거가 없으면 null 을 사용합니다(추측 금지).
- vehicle_type: 오토바이/다마스/라보/1톤 등 명시된 차종, 없으면 null.
- consultation_type: 문의 목적을 짧은 명사구로(예: 퀵 접수, 운임 문의, 배차 확인, 재배차, 위치 문의).
- is_urgent: "지금/즉시/급함/바로/ASAP" 등 즉시성이면 true, 시간지정·일반문의면 false, 불명확하면 null.
- 각 항목 confidence(0~1) 제출, null 항목은 0.
- used_source_ids: 답변 작성에 실제로 참고한 과거 상담의 conversation id만 배열로 제출(없으면 빈 배열).
- 반드시 draft_consultation_answer 도구를 호출해 결과를 제출하세요.`;

const TOOL_NAME = "draft_consultation_answer";

const fieldSchema = (desc: string) => ({ type: ["string", "null"], description: desc });

const TOOL = {
  name: TOOL_NAME,
  description: "고객 문의에 대한 1차 답변문 초안과 추출 배차항목을 제출합니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      answer_draft: {
        type: "string",
        description: "고객에게 보낼 정중한 한국어 1차 답변문 초안",
      },
      client_name: fieldSchema("거래처명(회사/상호). 없으면 null"),
      manager_name: fieldSchema("담당자명(사람 이름). 없으면 null"),
      phone: fieldSchema("연락처(전화번호). 없으면 null"),
      origin: fieldSchema("출발지(상호/주소). 없으면 null"),
      destination: fieldSchema("도착지(상호/주소). 없으면 null"),
      vehicle_type: fieldSchema("차량종류. 없으면 null"),
      consultation_type: fieldSchema("상담유형(짧은 명사구). 없으면 null"),
      is_urgent: { type: ["boolean", "null"], description: "긴급여부. 판단 불가면 null" },
      confidence: {
        type: "object" as const,
        description: "각 추출 항목의 신뢰도 0~1",
        properties: Object.fromEntries(
          FIELD_KEYS.map((k) => [k, { type: "number" }]),
        ),
        required: FIELD_KEYS,
        additionalProperties: false,
      },
      used_source_ids: {
        type: "array" as const,
        description: "답변 근거로 사용한 과거 상담 conversation id 목록",
        items: { type: "string" },
      },
    },
    required: ["answer_draft", ...FIELD_KEYS, "confidence", "used_source_ids"],
    additionalProperties: false,
  },
  cache_control: { type: "ephemeral" as const },
};

type AnswerInput = ExtractionFields & {
  answer_draft: string;
  confidence: Record<FieldKey, number>;
  used_source_ids: string[];
};

// 답변문 가독성 정규화 — 줄바꿈은 모델이 결정하고, 여기서는 빈 줄만 제거한다.
//   · 줄 끝 공백 제거 → 연속 개행(\n\n…)을 단일 \n 으로 치환 → 앞뒤 공백 trim.
//   · 문장을 강제로 쪼개지 않는다(예: "접수 감사합니다. 논스톱입니다."는 한 줄 유지).
export function normalizeAnswerText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r\n/g, "\n") // CRLF → LF
    .replace(/[ \t]+\n/g, "\n") // 줄 끝 공백 제거
    .replace(/\n{2,}/g, "\n") // 빈 줄 제거 — 연속 개행을 단일 개행으로
    .trim();
}

// 검색 결과 → 모델에 넘길 "과거 상담 기록" 텍스트. 근거가 없으면 그 사실을 명시한다.
function renderContext(ctx: RetrievedContext): string {
  if (ctx.snippets.length === 0 && ctx.examples.length === 0) {
    return "(관련된 과거 상담 기록을 찾지 못했습니다. 일반적인 응대 원칙과 질문 내용만으로 답변하세요.)";
  }
  const parts: string[] = [];

  if (ctx.examples.length > 0) {
    parts.push("【과거 유사 문의 → 직원 응답 예시】");
    ctx.examples.forEach((e, i) => {
      parts.push(
        `예시${i + 1} (conv ${e.conversation_id ?? "?"})\n  고객: ${e.question}\n  직원: ${e.answer}`,
      );
    });
  }

  if (ctx.snippets.length > 0) {
    parts.push("\n【관련 과거 메시지(직원 응답 우선)】");
    ctx.snippets.forEach((s) => {
      const who = s.sender_type === "staff" ? "직원" : "고객";
      const name = s.sender_name ? `/${s.sender_name}` : "";
      parts.push(`- [${who}${name}] (conv ${s.conversation_id}) ${s.content}`);
    });
  }

  const exts = ctx.extractions.filter((e) =>
    Object.values(e.fields).some((v) => v != null && v !== ""),
  );
  if (exts.length > 0) {
    parts.push("\n【관련 대화의 확정 배차항목(참고)】");
    exts.forEach((e) => {
      const f = e.fields;
      parts.push(
        `- conv ${e.conversation_id}: 거래처=${f.client_name ?? "-"} 출발=${f.origin ?? "-"} 도착=${f.destination ?? "-"} 차량=${f.vehicle_type ?? "-"}`,
      );
    });
  }

  return parts.join("\n");
}

export interface AnswerContextExtras {
  // 주거래처로 인식 시: 그 거래처의 지식베이스 요약(우선 근거)
  knowledgeText?: string | null;
  // 일반 문의로 인식 시: 관련 FAQ(우선 근거)
  faqText?: string | null;
  // 거래처 구분 힌트(주거래처/일반/신규후보)
  modeHint?: string | null;
  // 이 거래처의 AI 업무규칙(예외/운임/응대 규칙) — 반드시 우선 준수
  rulesText?: string | null;
}

export async function generateAnswer(
  question: string,
  ctx: RetrievedContext,
  extras: AnswerContextExtras = {},
): Promise<AnswerResult> {
  const client = getClient();
  const contextText = renderContext(ctx);

  const priorBlocks: string[] = [];
  if (extras.modeHint) priorBlocks.push(`[거래처 구분] ${extras.modeHint}`);
  if (extras.rulesText) {
    priorBlocks.push(
      `=== 이 거래처 업무규칙(반드시 우선 준수 — 운임/경유/할인/수배할증/응대 예외) ===\n${extras.rulesText}\n=== 업무규칙 끝 ===`,
    );
  }
  if (extras.knowledgeText) {
    priorBlocks.push(
      `=== 이 거래처 지식베이스(우선 근거) ===\n${extras.knowledgeText}\n=== 지식베이스 끝 ===`,
    );
  }
  if (extras.faqText) {
    priorBlocks.push(`=== 관련 FAQ(우선 근거) ===\n${extras.faqText}\n=== FAQ 끝 ===`);
  }
  const priorText = priorBlocks.length > 0 ? priorBlocks.join("\n\n") + "\n\n" : "";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `다음은 새로 들어온 고객 문의입니다. 아래 근거(지식베이스/FAQ가 있으면 우선)와 과거 상담 기록을 바탕으로 1차 답변문과 추출 항목을 만들어 도구로 제출하세요.

${priorText}=== 고객 문의(질문) ===
${question}
=== 질문 끝 ===

=== 과거 상담 기록(검색 결과) ===
${contextText}
=== 기록 끝 ===`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("AI가 답변 결과를 반환하지 않았습니다.");
  }
  const input = block.input as AnswerInput;

  const fields: ExtractionFields = {
    client_name: input.client_name ?? null,
    manager_name: input.manager_name ?? null,
    phone: input.phone ?? null,
    origin: input.origin ?? null,
    destination: input.destination ?? null,
    vehicle_type: input.vehicle_type ?? null,
    consultation_type: input.consultation_type ?? null,
    is_urgent: input.is_urgent ?? null,
  };
  const c = input.confidence ?? ({} as Record<FieldKey, number>);
  const confidence = Object.fromEntries(
    FIELD_KEYS.map((k) => [k, typeof c[k] === "number" ? c[k] : 0]),
  ) as Record<FieldKey, number>;

  return {
    answer_draft: normalizeAnswerText(input.answer_draft ?? ""),
    fields,
    confidence,
    used_source_ids: Array.isArray(input.used_source_ids) ? input.used_source_ids : [],
    model: message.model,
    raw: input,
  };
}
