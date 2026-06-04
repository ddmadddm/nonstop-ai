// 자료 업로드용 상담유형 고정 목록 (사용자 지정)
export const CONSULTATION_TYPES = [
  "퀵 접수",
  "화물 접수",
  "운임 문의",
  "배차 문의",
  "배차 지연",
  "기사 문의",
  "취소 문의",
  "정산 문의",
  "세금계산서 문의",
  "기타",
] as const;

export type ConsultationType = (typeof CONSULTATION_TYPES)[number];
