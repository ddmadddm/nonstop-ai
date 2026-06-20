// 상담자료 표시상태(7종) — 변환 단계(status) + 추출 단계(ext_status/needs_review) 합성.
//   서버/클라이언트 공용(서버 의존성 없음).
export interface MaterialStatusInput {
  status: string; // uploaded | converting | convert_failed | converted
  ext_status?: string | null; // conversation_extractions.status
  needs_review?: boolean | null;
}

export type DisplayStatus =
  | "uploaded"
  | "converting"
  | "convert_failed"
  | "extract_pending"
  | "extracted"
  | "needs_review"
  | "confirmed";

export function displayStatus(m: MaterialStatusInput): DisplayStatus {
  if (m.status === "uploaded") return "uploaded";
  if (m.status === "converting") return "converting";
  if (m.status === "convert_failed") return "convert_failed";
  // status === 'converted' → 추출 단계로 판정
  if (!m.ext_status || m.ext_status === "failed" || m.ext_status === "pending") {
    return "extract_pending";
  }
  if (m.ext_status === "confirmed") return "confirmed";
  if (m.needs_review) return "needs_review";
  return "extracted"; // extracted | edited
}

export const STATUS_META: Record<DisplayStatus, { label: string; cls: string }> = {
  uploaded: { label: "업로드완료", cls: "bg-slate-100 text-slate-600" },
  converting: { label: "변환중", cls: "bg-sky-100 text-sky-700" },
  convert_failed: { label: "변환실패", cls: "bg-rose-100 text-rose-700" },
  extract_pending: { label: "추출대기", cls: "bg-amber-100 text-amber-700" },
  extracted: { label: "추출완료", cls: "bg-emerald-100 text-emerald-700" },
  needs_review: { label: "검수필수", cls: "bg-rose-100 text-rose-700 font-medium" },
  confirmed: { label: "확정", cls: "bg-emerald-600 text-white" },
};
