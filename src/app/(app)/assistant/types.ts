// 논사원 1차 답변 — 공유 타입/상수.
//   주의: "use server" 파일(actions.ts)은 async 함수만 export 할 수 있으므로,
//   런타임 상수(MODE_LABEL)와 타입은 이 일반 모듈에 둔다.
import type { ExtractionFields, FieldKey } from "@/lib/ai/extract";
import type { ExtractionAddresses } from "@/lib/db/addresses";

// 요금 초안(직원 확인용) — 논사원 답변에 첨부.
export interface PriceDraft {
  suggestedPrice: number | null;
  selectedRuleType: string; // client_rate | client_rule | common_manual | ai_estimate
  basePrice: number | null;
  surchargeTotal: number;
  discountAmount: number;
  confidence: number;
  requiresReview: boolean;
  warnings: string[];
  source: string;
  memo?: string | null; // 직원 메모
  edited?: boolean; // 직원이 수정·저장함(기억됨)
}

// 거래처 구분(라디오) — 직원 선택값
export type ClientMode = "auto" | "general" | "key_client" | "new_candidate";
export type ResolvedMode = Exclude<ClientMode, "auto">;

export const MODE_LABEL: Record<ResolvedMode, string> = {
  general: "일반 문의",
  key_client: "주거래처",
  new_candidate: "신규 거래처 후보",
};

export interface Recognition {
  requestedMode: ClientMode;
  resolvedMode: ResolvedMode;
  auto: boolean; // 자동판단으로 결정됐는지
  matchedClientId: string | null;
  matchedClientName: string | null;
  matchType: "phone" | "name" | "manual" | null;
  confidence: number; // 0~1
  extracted: {
    client_name: string | null;
    manager_name: string | null;
    phone: string | null;
    origin: string | null;
    destination: string | null;
  };
  prospectSaved: boolean;
}

export interface AnswerSource {
  conversation_id: string;
  excerpt: string;
  used: boolean;
}

export interface AnswerActionResult {
  ok: boolean;
  message: string;
  draftId?: string; // 저장된 답변 기록 id(수정본 저장에 사용)
  answer?: string;
  fields?: ExtractionFields;
  confidence?: Record<FieldKey, number>;
  sources?: AnswerSource[];
  matchedTotal?: number;
  recognition?: Recognition;
  basis?: string[]; // 참고한 근거 라벨
  addressConversion?: ExtractionAddresses | null; // 출발/도착 주소 변환(신/구/가격표)
  priceDraft?: PriceDraft | null; // 요금 초안(직원 확인용)
}
