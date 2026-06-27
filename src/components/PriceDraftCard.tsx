// 요금 초안 카드(읽기 전용) — 논사원 답변/상담 화면 공용. 직원 확인용 내부 정보.
//   AI는 확정하지 않고 초안만 제안. 최종 확정은 직원.
import type { PriceDraft } from "@/app/(app)/assistant/types";

const won = (n: number | null) => (n != null ? n.toLocaleString() + "원" : "—");
const RULE_LABEL: Record<string, string> = {
  client_rate: "거래처 단가표",
  client_rule: "거래처 규칙",
  common_manual: "공통 매뉴얼",
  ai_estimate: "AI 추정",
};

export default function PriceDraftCard({ price }: { price: PriceDraft | null }) {
  if (!price) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40">
      <div className="px-4 py-2 border-b border-amber-100 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-amber-900">💰 요금 초안 (직원 확인용)</span>
        <span className="rounded-full bg-white border border-amber-200 text-amber-800 px-2 py-0.5 text-[11px]">
          적용 기준: {RULE_LABEL[price.selectedRuleType] ?? price.selectedRuleType}
        </span>
        {price.requiresReview && (
          <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-medium">직원 확인 필요</span>
        )}
        <span className="ml-auto text-xs text-slate-500">신뢰도 {Math.round(price.confidence * 100)}%</span>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Box label="기본요금" v={won(price.basePrice)} />
        <Box label="할증 합계" v={won(price.surchargeTotal)} />
        <Box label="할인" v={won(price.discountAmount)} />
        <Box label="제안금액" v={won(price.suggestedPrice)} strong />
      </div>
      {price.warnings.length > 0 && (
        <ul className="px-4 pb-3 -mt-1 text-[11px] text-rose-600 list-disc list-inside space-y-0.5">
          {price.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      <p className="px-4 pb-3 text-[11px] text-slate-400">
        ※ AI 초안입니다. 고객 안내는 “예상 ○○원부터”로, 최종 금액은 배차 확인 후 직원이 확정하세요.
      </p>
    </div>
  );
}
function Box({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`tabular-nums ${strong ? "text-base font-bold text-amber-900" : ""}`}>{v}</div>
    </div>
  );
}
