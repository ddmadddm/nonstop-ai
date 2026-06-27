"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RateSheet, RateItem } from "@/lib/db/pricing";
import {
  uploadRateSheetAction, setRateSheetStatusAction, deactivateRateSheetAction,
  addRateItemAction, deactivateRateItemAction,
} from "../actions";

const won = (n: number | null) => (n != null ? n.toLocaleString() : "—");
const inp = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm";
const STATUS: Record<string, string> = { draft: "bg-slate-100 text-slate-600", active: "bg-emerald-100 text-emerald-700", archived: "bg-zinc-200 text-zinc-600" };

export default function RateSheetSection({
  clientId, sheets, itemsBySheet,
}: {
  clientId: string;
  sheets: RateSheet[];
  itemsBySheet: Record<string, RateItem[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function upload(fd: FormData) {
    startTransition(async () => {
      const r = await uploadRateSheetAction(clientId, fd);
      setMsg(r.message);
      if (r.ok) { router.refresh(); (document.getElementById(`rs-${clientId}`) as HTMLFormElement)?.reset(); }
    });
  }
  function setStatus(id: string, s: "draft" | "active" | "archived") {
    startTransition(async () => { await setRateSheetStatusAction(id, clientId, s); router.refresh(); });
  }
  function delSheet(id: string) {
    if (!confirm("단가표를 삭제(비활성화)할까요?")) return;
    startTransition(async () => { await deactivateRateSheetAction(id, clientId); router.refresh(); });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="text-sm font-semibold">거래처 단가표 <span className="text-slate-400 font-normal">({sheets.length})</span></div>
      <p className="text-[11px] text-slate-400">
        단가표 원본을 보관하고, 표준화 항목을 수동 입력합니다(자동 파싱은 다음 단계). 거래처 단가표가 있으면 공통 매뉴얼보다 우선 적용됩니다.
      </p>

      {/* 업로드 */}
      <form id={`rs-${clientId}`} action={upload} className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <input name="title" required placeholder="단가표명 *" className={inp} />
        <input name="origin_base_area" placeholder="출발 기준지" className={inp} />
        <input type="date" name="effective_from" className={inp} title="적용 시작일" />
        <input type="file" name="file" accept=".xlsx,.xls,.csv" className={`${inp} col-span-2`} />
        <input name="memo" placeholder="메모" className={inp} />
        <div className="col-span-2 sm:col-span-3 flex items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 text-white text-sm px-4 py-1.5 disabled:opacity-50">단가표 등록</button>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>
      </form>

      {/* 목록 */}
      {sheets.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 단가표가 없습니다.</p>
      ) : (
        sheets.map((s) => (
          <details key={s.id} className="rounded-lg border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 flex items-center gap-2 flex-wrap text-sm">
              <span className="font-medium">{s.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[s.status]}`}>{s.status}</span>
              {s.origin_base_area && <span className="text-xs text-slate-400">출발 {s.origin_base_area}</span>}
              <span className="text-xs text-slate-400">v{s.version}{s.effective_from ? ` · ${s.effective_from}~` : ""}</span>
              {s.file_name && <span className="text-xs text-slate-400">📎 {s.file_name}</span>}
              <span className="text-xs text-slate-400">· {s.created_at.slice(0, 10)}</span>
              <span className="ml-auto flex gap-1.5 text-[11px]">
                {s.status !== "active" && <button type="button" onClick={(e) => { e.preventDefault(); setStatus(s.id, "active"); }} className="text-emerald-600 hover:underline">활성</button>}
                {s.status === "active" && <button type="button" onClick={(e) => { e.preventDefault(); setStatus(s.id, "archived"); }} className="text-slate-500 hover:underline">보관</button>}
                <button type="button" onClick={(e) => { e.preventDefault(); delSheet(s.id); }} className="text-rose-500 hover:underline">삭제</button>
              </span>
            </summary>
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead><tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                  {["출발권역", "도착권역", "차종", "정상가", "할인가", "경쟁가", "청구가", "기사비", "경유규칙", "할증규칙", "검수", ""].map((h, i) => <th key={i} className="px-2.5 py-1.5 font-medium">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {(itemsBySheet[s.id] ?? []).length === 0 && <tr><td colSpan={12} className="p-3 text-center text-slate-400">표준화 항목 없음</td></tr>}
                  {(itemsBySheet[s.id] ?? []).map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="px-2.5 py-1.5">{it.origin_area ?? "—"}</td>
                      <td className="px-2.5 py-1.5">{it.destination_area ?? "—"}</td>
                      <td className="px-2.5 py-1.5">{it.vehicle_type ?? "—"}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{won(it.normal_price)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{won(it.discounted_price)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{won(it.competitive_price)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{won(it.billing_price)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{won(it.driver_price_reference)}</td>
                      <td className="px-2.5 py-1.5 text-xs text-slate-500">{it.stopover_rule ?? "—"}</td>
                      <td className="px-2.5 py-1.5 text-xs text-slate-500">{it.surcharge_rule ?? "—"}</td>
                      <td className="px-2.5 py-1.5">{it.requires_review ? "필요" : "—"}</td>
                      <td className="px-2.5 py-1.5"><RemoveItem id={it.id} clientId={clientId} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AddItemForm rateSheetId={s.id} clientId={clientId} />
            </div>
          </details>
        ))
      )}
    </div>
  );
}

function RemoveItem({ id, clientId }: { id: string; clientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button onClick={() => startTransition(async () => { await deactivateRateItemAction(id, clientId); router.refresh(); })}
      disabled={pending} className="text-xs text-rose-500 hover:text-rose-700 disabled:opacity-50">삭제</button>
  );
}

function AddItemForm({ rateSheetId, clientId }: { rateSheetId: string; clientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  function add(fd: FormData) {
    startTransition(async () => {
      const r = await addRateItemAction(rateSheetId, clientId, fd);
      setMsg(r.ok ? null : r.message);
      if (r.ok) { router.refresh(); (document.getElementById(`ri-${rateSheetId}`) as HTMLFormElement)?.reset(); }
    });
  }
  return (
    <form id={`ri-${rateSheetId}`} action={add} className="flex flex-wrap items-center gap-1.5 p-2.5 border-t border-slate-100 bg-slate-50">
      <input name="origin_area" placeholder="출발권역" className={`${inp} w-24`} />
      <input name="destination_area" placeholder="도착권역" className={`${inp} w-24`} />
      <input name="vehicle_type" placeholder="차종" className={`${inp} w-20`} />
      <input name="normal_price" type="number" placeholder="정상가" className={`${inp} w-20`} />
      <input name="discounted_price" type="number" placeholder="할인가" className={`${inp} w-20`} />
      <input name="competitive_price" type="number" placeholder="경쟁가" className={`${inp} w-20`} />
      <input name="billing_price" type="number" placeholder="청구가" className={`${inp} w-20`} />
      <input name="driver_price_reference" type="number" placeholder="기사비" className={`${inp} w-20`} />
      <input name="stopover_rule" placeholder="경유규칙" className={`${inp} w-24`} />
      <input name="surcharge_rule" placeholder="할증규칙" className={`${inp} w-24`} />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="requires_review" />검수</label>
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-700 text-white text-sm px-3 py-1.5 disabled:opacity-50">+ 항목</button>
      {msg && <span className="text-xs text-rose-600">{msg}</span>}
    </form>
  );
}
