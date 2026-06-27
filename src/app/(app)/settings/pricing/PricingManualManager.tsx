"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BaseRate, Surcharge, Stopover, Variable } from "@/lib/db/pricing";
import type { EstimateResult } from "@/lib/pricing/estimate";
import {
  addBaseRateAction, delBaseRateAction, addSurchargeAction, delSurchargeAction,
  addStopoverAction, delStopoverAction, addVariableAction, delVariableAction, estimateTestAction,
} from "./actions";

const won = (n: number | null) => (n != null ? n.toLocaleString() + "원" : "—");
const inp = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm";
const STOP_LABEL: Record<string, string> = { same_area: "같은 구/동네", near_city: "타도시 근거리", far: "먼 거리" };

export default function PricingManualManager({
  manualId, base, surcharges, stopovers, variables,
}: {
  manualId: string; base: BaseRate[]; surcharges: Surcharge[]; stopovers: Stopover[]; variables: Variable[];
}) {
  const TABS = [
    { k: "base", label: `기본요금 ${base.length}` },
    { k: "surcharge", label: `일반할증 ${surcharges.length}` },
    { k: "stopover", label: `경유할증 ${stopovers.length}` },
    { k: "variable", label: `기타 유동할증 ${variables.length}` },
    { k: "test", label: "계산 테스트" },
  ];
  const [tab, setTab] = useState("base");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function del(fn: (id: string) => Promise<{ ok: boolean }>, id: string) {
    if (!confirm("비활성화할까요?")) return;
    startTransition(async () => { await fn(id); router.refresh(); });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 ${tab === t.k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "base" && (
        <Section
          headers={["차종", "기본요금", "기준 설명", "정렬", ""]}
          rows={base.map((r) => [r.vehicle_type, won(r.base_price), r.base_condition ?? "—", String(r.sort_order),
            <DelBtn key="d" onClick={() => del(delBaseRateAction, r.id)} disabled={pending} />])}
          form={<AddForm action={(fd) => addBaseRateAction(manualId, fd)} fields={[
            { name: "vehicle_type", ph: "차종 *" }, { name: "base_price", ph: "기본요금", type: "number" },
            { name: "base_condition", ph: "기준 설명" }, { name: "sort_order", ph: "정렬", type: "number", w: "w-16" },
          ]} />}
        />
      )}

      {tab === "surcharge" && (
        <Section
          headers={["할증명", "퀵", "트럭", "방식", "시간대", "검수", "정렬", ""]}
          rows={surcharges.map((r) => [r.name, won(r.quick_amount), won(r.truck_amount), r.calculation_type,
            r.time_start ? `${r.time_start}~${r.time_end}` : (r.calculation_type !== "fixed" ? `${r.percent_min ?? ""}~${r.percent_max ?? ""}%` : "—"),
            r.requires_review ? "필요" : "—", String(r.sort_order),
            <DelBtn key="d" onClick={() => del(delSurchargeAction, r.id)} disabled={pending} />])}
          form={<AddForm action={(fd) => addSurchargeAction(manualId, fd)} fields={[
            { name: "name", ph: "할증명 *" }, { name: "quick_amount", ph: "퀵", type: "number", w: "w-20" },
            { name: "truck_amount", ph: "트럭", type: "number", w: "w-20" },
            { name: "calculation_type", ph: "fixed", w: "w-24" }, { name: "time_start", ph: "시작 HH:MM", w: "w-24" },
            { name: "time_end", ph: "종료 HH:MM", w: "w-24" }, { name: "sort_order", ph: "정렬", type: "number", w: "w-16" },
          ]} check={{ name: "requires_review", label: "직원확인" }} />}
        />
      )}

      {tab === "stopover" && (
        <Section
          headers={["경유 구분", "차종", "추가금액", "설명", "정렬", ""]}
          rows={stopovers.map((r) => [STOP_LABEL[r.stopover_type] ?? r.stopover_type, r.vehicle_type, won(r.amount), r.description ?? "—", String(r.sort_order),
            <DelBtn key="d" onClick={() => del(delStopoverAction, r.id)} disabled={pending} />])}
          form={<AddForm action={(fd) => addStopoverAction(manualId, fd)} fields={[
            { name: "stopover_type", ph: "구분(same_area/near_city/far) *", w: "w-48" }, { name: "vehicle_type", ph: "차종 *" },
            { name: "amount", ph: "추가금액", type: "number", w: "w-24" }, { name: "description", ph: "설명" },
            { name: "sort_order", ph: "정렬", type: "number", w: "w-16" },
          ]} />}
        />
      )}

      {tab === "variable" && (
        <Section
          headers={["항목명", "처리방식", "기본금액", "직원확인", "설명", "정렬", ""]}
          rows={variables.map((r) => [r.name, r.default_handling, won(r.default_amount), r.requires_review ? "필요" : "—", r.description ?? "—", String(r.sort_order),
            <DelBtn key="d" onClick={() => del(delVariableAction, r.id)} disabled={pending} />])}
          form={<AddForm action={(fd) => addVariableAction(manualId, fd)} fields={[
            { name: "name", ph: "항목명 *" }, { name: "default_handling", ph: "별도협의/직원확인/자동계산", w: "w-44" },
            { name: "default_amount", ph: "기본금액", type: "number", w: "w-24" }, { name: "description", ph: "설명" },
            { name: "sort_order", ph: "정렬", type: "number", w: "w-16" },
          ]} check={{ name: "requires_review", label: "직원확인" }} />}
        />
      )}

      {tab === "test" && <TestTab />}
    </div>
  );
}

function Section({ headers, rows, form }: { headers: string[]; rows: React.ReactNode[][]; form: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
          {headers.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 && <tr><td colSpan={headers.length} className="p-4 text-center text-slate-400">항목 없음</td></tr>}
          {rows.map((r, i) => <tr key={i} className="hover:bg-slate-50">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}
        </tbody>
      </table>
      {form}
    </div>
  );
}

function DelBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="text-xs text-rose-500 hover:text-rose-700 disabled:opacity-50">비활성</button>;
}

function AddForm({
  action, fields, check,
}: {
  action: (fd: FormData) => Promise<{ ok: boolean; message: string }>;
  fields: { name: string; ph: string; type?: string; w?: string }[];
  check?: { name: string; label: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  function submit(fd: FormData) {
    startTransition(async () => {
      const r = await action(fd);
      setMsg(r.message);
      if (r.ok) { router.refresh(); (document.activeElement as HTMLElement)?.blur(); }
    });
  }
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2 p-2.5 border-t border-slate-100 bg-slate-50">
      {fields.map((f) => (
        <input key={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.ph} className={`${inp} ${f.w ?? "w-28"}`} />
      ))}
      {check && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name={check.name} />{check.label}</label>}
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-50">+ 추가</button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </form>
  );
}

function TestTab() {
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<EstimateResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  function run(fd: FormData) {
    startTransition(async () => {
      const r = await estimateTestAction(fd);
      setMsg(r.message);
      setRes(r.result ?? null);
    });
  }
  return (
    <div className="space-y-3">
      <form action={run} className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="text-xs"><span className="text-slate-500">차종</span><input name="vehicle_type" placeholder="오토바이 / 트럭 1톤" className={`mt-1 w-full ${inp}`} /></label>
        <label className="text-xs"><span className="text-slate-500">출발(가격표 기준)</span><input name="origin" className={`mt-1 w-full ${inp}`} /></label>
        <label className="text-xs"><span className="text-slate-500">도착(가격표 기준)</span><input name="destination" className={`mt-1 w-full ${inp}`} /></label>
        <label className="text-xs"><span className="text-slate-500">요청시각</span><input type="datetime-local" name="requested_at" className={`mt-1 w-full ${inp}`} /></label>
        <label className="text-xs"><span className="text-slate-500">경유 수</span><input type="number" name="stopover_count" defaultValue="0" className={`mt-1 w-full ${inp}`} /></label>
        <label className="text-xs"><span className="text-slate-500">경유 구분</span>
          <select name="stopover_type" className={`mt-1 w-full ${inp} bg-white`}>
            <option value="">없음</option><option value="same_area">같은 구/동네</option><option value="near_city">타도시 근거리</option><option value="far">먼 거리</option>
          </select>
        </label>
        <label className="text-xs"><span className="text-slate-500">유동(수작업/기상/수배지연)</span><input name="service_type" className={`mt-1 w-full ${inp}`} /></label>
        <label className="flex items-center gap-1 text-sm mt-4"><input type="checkbox" name="is_holiday" />휴일</label>
        <label className="flex items-center gap-1 text-sm mt-4"><input type="checkbox" name="is_round_trip" />왕복</label>
        <div className="col-span-2 sm:col-span-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50">요금 초안 계산</button>
          {msg && <span className="ml-2 text-xs text-slate-500">{msg}</span>}
        </div>
      </form>

      {res && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">요금 초안</span>
            <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px]">{res.source}</span>
            <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px]">{res.selectedRuleType}</span>
            {res.requiresReview && <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-medium">직원 확인 필요</span>}
            <span className="ml-auto text-xs text-slate-400">신뢰도 {Math.round(res.confidence * 100)}%</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <Box label="기본요금" v={won(res.basePrice)} />
            <Box label="할증 합계" v={won(res.surchargeTotal)} />
            <Box label="할인" v={won(res.discountAmount)} />
            <Box label="제안금액" v={won(res.suggestedPrice)} strong />
          </div>
          {res.warnings.length > 0 && (
            <ul className="text-[11px] text-rose-600 list-disc list-inside">
              {res.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          <p className="text-[11px] text-slate-400">※ AI 초안입니다. 최종 금액은 직원이 확정합니다.</p>
        </div>
      )}
    </div>
  );
}
function Box({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`tabular-nums ${strong ? "text-base font-bold" : ""}`}>{v}</div>
    </div>
  );
}
