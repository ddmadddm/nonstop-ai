// 상담 데이터 구조화 — 카카오 상담 대화 → 8개 항목 자동 추출.
//   Anthropic SDK + 강제 tool use(structured output)로 스키마를 보장한다.
//   프롬프트 캐싱: 안정적인 system 프롬프트 + tool 스키마(프리픽스)에 cache_control,
//   매번 달라지는 대화 원문은 messages 에 두어 캐시 프리픽스를 깨지 않는다.
//
//   모델: 추출은 분류성 작업이라 저비용 Haiku 4.5 기본(요청사항). ANTHROPIC_EXTRACT_MODEL 로 변경.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_EXTRACT_MODEL ?? "claude-haiku-4-5";

export interface ExtractionFields {
  client_name: string | null; // 거래처명
  manager_name: string | null; // 담당자명
  phone: string | null; // 연락처
  origin: string | null; // 출발지
  destination: string | null; // 도착지
  vehicle_type: string | null; // 차량종류
  consultation_type: string | null; // 상담유형
  is_urgent: boolean | null; // 긴급여부
}

export type FieldKey = keyof ExtractionFields;
export const FIELD_KEYS: FieldKey[] = [
  "client_name",
  "manager_name",
  "phone",
  "origin",
  "destination",
  "vehicle_type",
  "consultation_type",
  "is_urgent",
];

export interface ExtractionResult {
  fields: ExtractionFields;
  confidence: Record<FieldKey, number>;
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

const SYSTEM = `당신은 한국의 퀵/화물 배차 중개회사 "논스톱"의 상담 데이터 분석가입니다.
카카오 상담톡 대화 원문을 읽고, 배차 접수에 필요한 핵심 항목을 정확히 추출합니다.

트랜스크립트 화자 표기: 각 줄은 \`[직원/이름]\` 또는 \`[고객/이름]\` 으로 시작합니다.
\`직원\`(sender_type=staff)은 우리 회사(논스톱) 측 상담원이고, \`고객\`은 의뢰한 거래처 측입니다.

고객/직원 구분 규칙(거래처명·담당자명 추출 시 반드시 준수):
- "논스톱서비스", "논스톱", 그 외 \`[직원/...]\` 으로 표기된 발화자는 우리 회사 직원이므로
  client_name(거래처명)·manager_name(담당자명) 후보에서 **제외**합니다. 절대 추출하지 않습니다.
- client_name(거래처명)은 **회사명/상호가 명시된 경우에만** 저장합니다. 사람 이름만 있으면 null.
- 거래처 측에 사람 이름만 있고 회사명이 없으면: client_name=null, manager_name=그 사람 이름.
- 거래처/담당자는 \`[고객/...]\` 측에서만 찾습니다. 보통 최초 발화자가 고객이면 그 고객 정보를 우선합니다.

규칙:
- 대화에 명시되거나 분명히 추론되는 값만 추출합니다. 근거가 없으면 반드시 null 을 사용합니다(추측 금지).
- 원문을 변형하지 말고 값 그대로(주소/상호/번호) 추출합니다. 여러 후보가 있으면 가장 최근·가장 확정적인 값을 택합니다.
- vehicle_type(차량종류)은 보통 다음 중 하나입니다: 오토바이, 다마스, 라보, 1톤, 그 외 명시된 차종. 없으면 null.
- consultation_type(상담유형)은 대화의 목적을 짧은 명사구로 요약합니다(예: 퀵 접수, 운임 문의, 배차 확인, 재배차, 위치 문의, 기타).
- is_urgent(긴급여부)는 "지금/즉시/급함/바로/ASAP" 등 즉시성을 요구하면 true, 시간 지정·일반 문의면 false, 판단 불가면 null.
- phone(연락처)은 한국 전화번호 형식을 우선합니다.
- 각 항목의 confidence(0~1)를 함께 제출합니다. null 로 둔 항목의 confidence 는 0 으로 둡니다.
- 반드시 save_consultation_fields 도구를 호출해 결과를 제출하세요.`;

const TOOL_NAME = "save_consultation_fields";

// 강제 tool use용 스키마(structured output). strict:true 로 스키마를 보장.
const TOOL = {
  name: TOOL_NAME,
  description: "추출한 상담 항목과 항목별 신뢰도를 제출합니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      client_name: { type: ["string", "null"], description: "거래처명(회사/상호). 없으면 null" },
      manager_name: { type: ["string", "null"], description: "담당자명(사람 이름). 없으면 null" },
      phone: { type: ["string", "null"], description: "연락처(전화번호). 없으면 null" },
      origin: { type: ["string", "null"], description: "출발지(상호/주소). 없으면 null" },
      destination: { type: ["string", "null"], description: "도착지(상호/주소). 없으면 null" },
      vehicle_type: { type: ["string", "null"], description: "차량종류. 없으면 null" },
      consultation_type: { type: ["string", "null"], description: "상담유형(짧은 명사구). 없으면 null" },
      is_urgent: { type: ["boolean", "null"], description: "긴급여부. 판단 불가면 null" },
      confidence: {
        type: "object" as const,
        description: "각 항목의 신뢰도 0~1",
        properties: {
          client_name: { type: "number" },
          manager_name: { type: "number" },
          phone: { type: "number" },
          origin: { type: "number" },
          destination: { type: "number" },
          vehicle_type: { type: "number" },
          consultation_type: { type: "number" },
          is_urgent: { type: "number" },
        },
        required: FIELD_KEYS,
        additionalProperties: false,
      },
    },
    required: [...FIELD_KEYS, "confidence"],
    additionalProperties: false,
  },
  // 프롬프트 캐싱: tool 스키마(프리픽스)를 캐시.
  cache_control: { type: "ephemeral" as const },
};

type ExtractionInput = ExtractionFields & {
  confidence: Record<FieldKey, number>;
};

export async function extractConsultation(
  transcript: string,
): Promise<ExtractionResult> {
  const client = getClient();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `다음은 카카오 상담톡 대화 원문입니다. 항목을 추출해 도구로 제출하세요.\n\n=== 대화 시작 ===\n${transcript}\n=== 대화 끝 ===`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("AI가 추출 결과를 반환하지 않았습니다.");
  }
  const input = block.input as ExtractionInput;

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

  return { fields, confidence, model: message.model, raw: input };
}
