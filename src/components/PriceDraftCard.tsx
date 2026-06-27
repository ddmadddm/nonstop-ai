"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PriceDraft } from "@/app/(app)/assistant/types";
import { savePriceDraftAction } from "@/app/(app)/assistant/actions";

const RULE_LABEL: Record<string, string> = {
  client_rate: "거래처 단가표", client_rule: "거래처 규칙", common_manual: "공통 매뉴얼", ai_estimate: "AI 추정", manual: "직원 입력",
};
const inp = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-right tabular-nums";

// 요금 초안(직원 확인용) — 직원이 금액/검수/메모를 수정·저장(기억). draftId 가 있으면 편집 가능.
export default function PriceDraftCard({ price, draftId }: { price: PriceDraft | null; draftId?: string }) {
  const router = useRouter();
  const [base, setBase] = useState(price?.basePrice ?? "");
  const [sur, setSur] = useState(price?.surchargeTotal ?? 0);
  const [disc, setDisc] = useState(price?.discountAmount ?? 0);
  const [sugg, setSugg] = useState(price?.suggestedPrice ?? "");
  const [review, setReview] = useState(price?.requiresReview ?? false);
  const [memo, setMemo] = useState(price?.memo ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const editable = Boolean(draftId);

  if (!price) return null;

  function save() {
    if (!draftId) return;
    const fd = new FormData();
    fd.set("base_price", String(base));
    fd.set("surcharge_total", String(sur));
    fd.set("discount_amount", String(disc));
    fd.set("suggested_price", String(sugg));
    fd.set("requires_review", review ? "true" : "false");
    fd.set("memo", memo);
    setMsg(null);
    startTransition(async () => {
      const r = await savePriceDraftAction(draftId, fd);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40">
      <div className="px-4 py-2 border-b border-amber-100 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-amber-900">💰 요금 초안 (직원 확인·수정)</span>
        <span className="rounded-full bg-white border border-amber-200 text-amber-800 px-2 py-0.5 text-[11px]">
          기준: {RULE_LABEL[price.selectedRuleType] ?? price.selectedRuleType}
        </span>
        {price.edited && <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px]">수정 저장됨</span>}
        <span className="ml-auto text-xs text-slate-500">신뢰도 {Math.round(price.confidence * 100)}%</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="기본요금" value={base} onChange={setBase} editable={editable} />
          <Field label="할증 합계" value={sur} onChange={(v) => setSur(Number(v) || 0)} editable={editable} />
          <Field label="할인" value={disc} onChange={(v) => setDisc(Number(v) || 0)} editable={editable} />
          <Field label="제안금액" value={sugg} onChange={setSugg} editable={editable} strong />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} disabled={!editable} />
          <span>직원 확인 필요</span>
        </label>

        <label className="block text-xs">
          <span className="text-slate-500">메모(직원)</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={!editable}
            placeholder="요금 산정 관련 메모"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-50"
          />
        </label>

        {price.warnings.length > 0 && (
          <ul className="text-[11px] text-rose-600 list-disc list-inside space-y-0.5">
            {price.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        <div className="flex items-center gap-2">
          {editable ? (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-amber-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50 hover:bg-amber-700"
            >
              {pending ? "저장 중…" : "요금 초안 저장"}
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">생성 후 저장하면 수정할 수 있습니다.</span>
          )}
          {msg && <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
          <span className="ml-auto text-[11px] text-slate-400">※ AI 초안 — 최종은 직원이 확정</span>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, editable, strong,
}: {
  label: string; value: number | string; onChange: (v: string) => void; editable: boolean; strong?: boolean;
}) {
  const display = value === "" || value == null ? "—" : Number(value).toLocaleString() + "원";
  return (
    <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      {editable ? (
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className={`${inp} mt-0.5 ${strong ? "font-bold" : ""}`} />
      ) : (
        <div className={`tabular-nums ${strong ? "text-base font-bold text-amber-900" : ""}`}>{display}</div>
      )}
    </div>
  );
}
