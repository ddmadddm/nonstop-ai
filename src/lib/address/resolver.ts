// 주소 변환 어댑터 — 원문 주소 → 신주소(도로명)/구주소(지번)/가격표 기준 지역 + 신뢰도.
//   현재 구현: 외부 API 없이 AI(Anthropic) 추정. 신뢰도가 낮으면 상위에서 '직원 확인 필요'로 처리.
//   향후: 카카오 주소 API·도로명주소 API 제공자를 이 인터페이스로 구현해 getAddressResolver 에서 교체.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_EXTRACT_MODEL ?? "claude-haiku-4-5";

export type AddressKind = "road" | "jibun" | "area" | "incomplete";
export const KIND_LABEL: Record<AddressKind, string> = {
  road: "신주소(도로명)",
  jibun: "구주소(지번)",
  area: "동/읍/면 단위",
  incomplete: "불완전 주소",
};

export interface ResolvedAddress {
  raw: string;
  kind: AddressKind;
  road_address: string | null; // 신주소(도로명)
  jibun_address: string | null; // 구주소(지번/동)
  pricing_area: string | null; // 가격표 기준 지역(시군구·동 수준)
  confidence: number; // 0~1
  source: "addressbook" | "ai" | "none";
}

export interface AddressResolver {
  name: string;
  isConfigured(): boolean;
  // 단일 주소 변환. 실패 시 throw.
  resolve(raw: string): Promise<ResolvedAddress>;
}

// ── AI(Anthropic) 기반 기본 제공자 ────────────────────────────────────
let _client: Anthropic | null = null;
function client(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 가 없습니다(주소 변환 불가).");
  return (_client ??= new Anthropic({ apiKey: key }));
}

const SYSTEM = `당신은 한국 주소 전문가입니다. 퀵/화물 배차의 운임 산정을 돕기 위해
입력된 출발지/도착지 문자열을 분석합니다. 외부 검색 없이 보유 지식으로 추정합니다.

분류(kind):
- road: 도로명주소(신주소). 예) "인천 중구 서해대로209번길 68"
- jibun: 지번주소(구주소). 예) "인천 중구 항동7가 70"
- area: 동/읍/면 수준만 있음. 예) "인천 중구 항동"
- incomplete: 주소가 아니거나(상호명 등) 식별 불가한 불완전 정보.

규칙:
- road_address(신주소·도로명)와 jibun_address(구주소·지번/동)를 가능한 채웁니다.
  도로명만 주어지면 지번을, 지번만 주어지면 도로명을 추정합니다.
- pricing_area(가격표 기준 지역): 운임표에 쓰는 행정구역 단위(보통 "시군구 + 동/읍/면").
  예) "인천 중구 항동". 정확한 동을 모르면 시군구까지만.
- 모르는 번지를 지어내지 마세요. 불확실하면 동 수준까지만 채우고 confidence 를 낮춥니다.
- 상호명만 있고 주소가 없으면 kind=incomplete, 값들은 null, confidence 는 낮게.
- confidence(0~1): 변환이 얼마나 확실한지. 추정이 많을수록 낮춥니다.
- 반드시 resolve_address 도구를 호출해 제출하세요.`;

const TOOL = {
  name: "resolve_address",
  description: "주소를 신/구 주소와 가격표 기준 지역으로 변환해 제출합니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: { type: "string", enum: ["road", "jibun", "area", "incomplete"] },
      road_address: { type: ["string", "null"], description: "신주소(도로명). 없으면 null" },
      jibun_address: { type: ["string", "null"], description: "구주소(지번/동). 없으면 null" },
      pricing_area: { type: ["string", "null"], description: "가격표 기준 지역(시군구+동). 없으면 null" },
      confidence: { type: "number", description: "변환 신뢰도 0~1" },
    },
    required: ["kind", "road_address", "jibun_address", "pricing_area", "confidence"],
    additionalProperties: false,
  },
  cache_control: { type: "ephemeral" as const },
};

interface ToolOut {
  kind: AddressKind;
  road_address: string | null;
  jibun_address: string | null;
  pricing_area: string | null;
  confidence: number;
}

export const aiResolver: AddressResolver = {
  name: "ai-anthropic",
  isConfigured: () => (process.env.ANTHROPIC_API_KEY ?? "").length > 10,
  async resolve(raw: string): Promise<ResolvedAddress> {
    const text = raw.trim();
    if (!text) {
      return { raw, kind: "incomplete", road_address: null, jibun_address: null, pricing_area: null, confidence: 0, source: "none" };
    }
    const message = await client().messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `주소 문자열: "${text}"\n분석해 도구로 제출하세요.` }],
    });
    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("주소 변환 결과가 없습니다.");
    const o = block.input as ToolOut;
    const conf = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0;
    return {
      raw,
      kind: o.kind ?? "incomplete",
      road_address: o.road_address ?? null,
      jibun_address: o.jibun_address ?? null,
      pricing_area: o.pricing_area ?? null,
      confidence: conf,
      source: "ai",
    };
  },
};

// 활성 제공자 선택 — 현재 AI. 추후 process.env.ADDRESS_RESOLVER 로 kakao/juso 등 분기.
export function getAddressResolver(): AddressResolver {
  return aiResolver;
}
export function isAddressResolverConfigured(): boolean {
  return getAddressResolver().isConfigured();
}
