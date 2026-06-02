import type { Category } from "./types";

// docs/07-category-taxonomy.md / data/categories.seed.csv 와 동일 체계
export const CATEGORIES: Category[] = [
  { key: "order", parentKey: null, name: "접수/오더", description: "거래처가 운송을 요청하는 단계" },
  { key: "order_new", parentKey: "order", name: "신규 오더요청", description: "새 퀵/화물 운송 요청" },
  { key: "order_multi", parentKey: "order", name: "경유/다중배송", description: "경유지 여러 곳·다중 하차" },
  { key: "order_time", parentKey: "order", name: "시간지정/즉시", description: "즉시입차·시간지정 등 시간 조건" },
  { key: "order_confirm", parentKey: "order", name: "접수 확인문의", description: "가능 여부·경유 순서·차량 가능 등" },
  { key: "dispatch", parentKey: null, name: "배차", description: "기사 매칭 및 배차 진행" },
  { key: "dispatch_progress", parentKey: "dispatch", name: "배차 진행", description: "기사 배정 진행 중 안내" },
  { key: "dispatch_done", parentKey: "dispatch", name: "배차완료 안내", description: "배차정보 전달" },
  { key: "dispatch_redispatch", parentKey: "dispatch", name: "재배차", description: "기사 이탈·취소로 다시 배차" },
  { key: "dispatch_vehicle", parentKey: "dispatch", name: "차량 매칭문의", description: "차종 가능 여부" },
  { key: "fare", parentKey: null, name: "운임/요금", description: "운임 문의 및 안내" },
  { key: "fare_inquiry", parentKey: "fare", name: "운임 문의/견적", description: "예상 운임 문의" },
  { key: "fare_notice", parentKey: "fare", name: "운임 안내", description: "확정 운임 안내(공급가 등)" },
  { key: "fare_extra", parentKey: "fare", name: "추가요금", description: "경유·대기·할증 등" },
  { key: "transit", parentKey: null, name: "운행/현황", description: "운행 진행 상황" },
  { key: "transit_location", parentKey: "transit", name: "기사 위치/현황", description: "지도 공유·기사 현재 위치" },
  { key: "transit_pickup", parentKey: "transit", name: "상차/픽업 확인", description: "출발지 도착·상차 여부" },
  { key: "transit_eta", parentKey: "transit", name: "도착예정/지연", description: "도착 시간·지연 안내" },
  { key: "transit_done", parentKey: "transit", name: "운행완료", description: "하차·완료 확인" },
  { key: "change", parentKey: null, name: "변경/취소", description: "오더 변경 및 취소" },
  { key: "change_modify", parentKey: "change", name: "오더 변경", description: "주소·시간·물품·차량 변경" },
  { key: "change_cancel", parentKey: "change", name: "오더 취소", description: "접수 건 취소" },
  { key: "driver", parentKey: null, name: "기사 관련", description: "담당 기사 관련 문의" },
  { key: "driver_contact", parentKey: "driver", name: "기사 연락처", description: "담당 기사 연락처/연결" },
  { key: "driver_claim", parentKey: "driver", name: "기사 클레임", description: "기사 응대·지각·태도 불만" },
  { key: "settlement", parentKey: null, name: "정산/세금계산서", description: "정산 및 세금계산서" },
  { key: "settlement_history", parentKey: "settlement", name: "정산 내역", description: "월 정산·운임 내역 확인" },
  { key: "settlement_tax", parentKey: "settlement", name: "세금계산서", description: "발행·재발행·수정" },
  { key: "settlement_unpaid", parentKey: "settlement", name: "미수/미납", description: "미수금·미납" },
  { key: "client", parentKey: null, name: "거래처/계약", description: "거래처 등록 및 계약" },
  { key: "client_new", parentKey: "client", name: "신규 거래 문의", description: "거래처 등록·이용 시작" },
  { key: "client_contract", parentKey: "client", name: "단가/계약", description: "단가표·운임 계약 조건" },
  { key: "claim", parentKey: null, name: "클레임/사고", description: "지연·파손·오배송 등" },
  { key: "claim_delay", parentKey: "claim", name: "지연 클레임", description: "늦은 도착 불만/보상" },
  { key: "claim_damage", parentKey: "claim", name: "파손/분실", description: "물품 파손·분실" },
  { key: "claim_wrong", parentKey: "claim", name: "오배송", description: "잘못된 하차·오배송" },
  { key: "etc", parentKey: null, name: "기타/일반", description: "기타 일반 문의" },
  { key: "etc_howto", parentKey: "etc", name: "이용 방법", description: "요청 방법·양식 안내" },
  { key: "etc_ops", parentKey: "etc", name: "영업/운영", description: "영업시간·운영 정책" },
  { key: "etc_other", parentKey: "etc", name: "기타", description: "위 어디에도 안 맞는 경우" },
];

const CAT_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryName(key: string): string {
  return CAT_BY_KEY.get(key)?.name ?? key;
}

export function topCategoryKey(key: string): string {
  const c = CAT_BY_KEY.get(key);
  return c?.parentKey ?? key;
}

// 대분류별 색상 (badge)
export const CATEGORY_COLOR: Record<string, string> = {
  order: "bg-blue-100 text-blue-700",
  dispatch: "bg-violet-100 text-violet-700",
  fare: "bg-emerald-100 text-emerald-700",
  transit: "bg-amber-100 text-amber-700",
  change: "bg-orange-100 text-orange-700",
  driver: "bg-cyan-100 text-cyan-700",
  settlement: "bg-teal-100 text-teal-700",
  client: "bg-indigo-100 text-indigo-700",
  claim: "bg-rose-100 text-rose-700",
  etc: "bg-slate-100 text-slate-600",
};

export function categoryColor(key: string): string {
  return CATEGORY_COLOR[topCategoryKey(key)] ?? "bg-slate-100 text-slate-600";
}

export const TOP_CATEGORIES = CATEGORIES.filter((c) => c.parentKey === null);
