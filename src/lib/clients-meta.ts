// 거래처/상담 공용 분류값 — 서버·클라이언트 공유(서버 의존성 없음).
//   DB의 check 제약과 값을 일치시킨다(0024_client_extras).

// 거래처 유형 — 기본정보 폼에서 선택 가능한 값(주거래처/일반거래처/휴면).
//   '비활성'은 is_active, '신규후보'는 client_prospects 로 별도 관리.
export const CLIENT_TYPES = ["주거래처", "일반거래처", "휴면"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const DEFAULT_CLIENT_TYPE: ClientType = "일반거래처";

// 목록/상세 뱃지 색상(구 데이터 1회성/잠재고객 포함 — 표시 안전).
export const CLIENT_TYPE_BADGE: Record<string, string> = {
  주거래처: "bg-emerald-100 text-emerald-700",
  일반거래처: "bg-slate-100 text-slate-600",
  휴면: "bg-zinc-200 text-zinc-600",
  "1회성": "bg-amber-100 text-amber-700",
  잠재고객: "bg-sky-100 text-sky-700",
};

// 결제방식
export const PAYMENT_METHODS = ["현금", "카드", "월말", "착불", "선불", "기타"] as const;

// 담당자 역할
export const CONTACT_ROLES = [
  "배차담당",
  "결제담당",
  "현장담당",
  "야간담당",
  "대표담당",
  "기타",
] as const;

// 주소명 카테고리
export const ADDRESS_CATEGORIES = [
  "본사",
  "공장",
  "창고",
  "1공장",
  "2공장",
  "현장",
  "기타",
] as const;

// 주소 확인 상태
export const ADDRESS_VERIFY = ["확인완료", "확인필요"] as const;

// 차종(차종별 운임)
export const VEHICLE_TYPES = [
  "오토바이",
  "다마스",
  "라보",
  "1톤",
  "2.5톤",
  "5톤",
  "냉탑",
  "윙바디",
  "리프트",
  "어부바차",
  "카캐리어",
] as const;

// AI 업무규칙 유형
export const RULE_TYPES = [
  "운임",
  "경유",
  "할인",
  "수배할증",
  "정산",
  "고객응대",
  "배차",
  "기타",
] as const;

// 문서 유형
export const DOC_TYPES = [
  "사업자등록증",
  "계약서",
  "통장사본",
  "견적서",
  "요금표",
  "마감내역",
  "기타",
] as const;

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
