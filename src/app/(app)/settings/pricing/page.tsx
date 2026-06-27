import Link from "next/link";
import {
  getActiveManual, listBaseRates, listSurcharges, listStopovers, listVariables,
} from "@/lib/db/pricing";
import PricingManualManager from "./PricingManualManager";

export const dynamic = "force-dynamic";

export default async function PricingManualPage() {
  const manual = await getActiveManual();
  if (!manual) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl">
        <p className="text-sm text-rose-600">활성 공통 가격책정 매뉴얼이 없습니다. (마이그레이션 seed 확인 필요)</p>
      </div>
    );
  }
  const [base, surcharges, stopovers, variables] = await Promise.all([
    listBaseRates(manual.id), listSurcharges(manual.id), listStopovers(manual.id), listVariables(manual.id),
  ]);

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full max-w-5xl">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/settings" className="text-slate-400 hover:text-slate-900">←</Link>
        <h1 className="text-lg font-semibold">운임/요금 관리</h1>
        <span className="text-slate-300">·</span>
        <span className="text-sm text-slate-600">공통 가격책정 매뉴얼</span>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
        <span className="font-semibold">{manual.name}</span>
        <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">v{manual.version}</span>
        <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs">활성</span>
        {manual.effective_from && <span className="text-xs text-slate-400">적용 {manual.effective_from}~</span>}
        <span className="ml-auto text-xs text-slate-400">신규 고객·단가표 없는 거래처 기준</span>
      </div>
      <p className="text-xs text-slate-400">
        신규 고객은 이 공통 매뉴얼로 계산하고, 거래처 단가표가 있으면 그 단가표를 우선 적용합니다.
        AI는 요금을 확정하지 않고 초안만 제안하며, 최종 확정은 직원이 합니다.
      </p>
      <PricingManualManager
        manualId={manual.id}
        base={base}
        surcharges={surcharges}
        stopovers={stopovers}
        variables={variables}
      />
    </div>
  );
}
