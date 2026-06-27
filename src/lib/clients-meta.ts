// 거래처/상담 공용 분류값 — 서버·클라이언트 공유(서버 의존성 없음).
//   DB의 check 제약과 값을 일치시킨다(0024_client_extras).

// 거래처 유형
export const CLIENT_TYPES = ["주거래처", "일반거래처", "1회성", "잠재고객"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const DEFAULT_CLIENT_TYPE: ClientType = "일반거래처";

// 목록/상세 뱃지 색상
export const CLIENT_TYPE_BADGE: Record<ClientType, string> = {
  주거래처: "bg-emerald-100 text-emerald-700",
  일반거래처: "bg-slate-100 text-slate-600",
  "1회성": "bg-amber-100 text-amber-700",
  잠재고객: "bg-sky-100 text-sky-700",
};

// 상담 유입 채널(6종)
export const INBOUND_CHANNELS = [
  "카카오채널",
  "카카오오픈톡",
  "전화",
  "문자",
  "채널톡",
  "기타",
] as const;
export type InboundChannel = (typeof INBOUND_CHANNELS)[number];

export function isClientType(v: unknown): v is ClientType {
  return typeof v === "string" && (CLIENT_TYPES as readonly string[]).includes(v);
}
export function isInboundChannel(v: unknown): v is InboundChannel {
  return typeof v === "string" && (INBOUND_CHANNELS as readonly string[]).includes(v);
}
