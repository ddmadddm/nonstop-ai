"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OptionCategory, ManagedOption } from "@/lib/db/client-options";
import { createOptionAction, updateOptionAction, deactivateOptionAction } from "./actions";

export default function OptionsManager({
  categories,
  byCat,
}: {
  categories: OptionCategory[];
  byCat: Record<string, ManagedOption[]>;
}) {
  const [tab, setTab] = useState(categories[0]?.key ?? "");
  const cat = categories.find((c) => c.key === tab);
  const options = byCat[tab] ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 ${
              tab === c.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {c.name} <span className="text-slate-400">({(byCat[c.key] ?? []).filter((o) => o.is_active).length})</span>
          </button>
        ))}
      </div>

      {cat && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
                <th className="px-3 py-2 font-medium w-16">순서</th>
                <th className="px-3 py-2 font-medium">항목명</th>
                <th className="px-3 py-2 font-medium">사용여부</th>
                <th className="px-3 py-2 font-medium">등록일</th>
                <th className="px-3 py-2 font-medium text-right">사용건수</th>
                <th className="px-3 py-2 font-medium text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {options.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400">항목이 없습니다.</td></tr>
              )}
              {options.map((o) => <OptionRow key={o.id} option={o} />)}
            </tbody>
          </table>
          <AddRow categoryKey={cat.key} />
        </div>
      )}
    </div>
  );
}

function OptionRow({ option }: { option: ManagedOption }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(option.label);
  const [sort, setSort] = useState(String(option.sort_order));
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    const fd = new FormData();
    fd.set("label", label);
    fd.set("sort_order", sort);
    startTransition(async () => {
      const r = await updateOptionAction(option.id, fd);
      setMsg(r.ok ? null : r.message);
      if (r.ok) { setEdit(false); router.refresh(); }
    });
  }
  function toggle() {
    const warn = option.usage_count > 0
      ? `'${option.label}'은(는) 현재 ${option.usage_count}건에서 사용 중입니다. 비활성화하면 신규 선택에서 빠지지만 기존 거래처 값은 유지됩니다. 진행할까요?`
      : `'${option.label}' 항목을 비활성화할까요?`;
    if (!confirm(warn)) return;
    startTransition(async () => { await deactivateOptionAction(option.id); router.refresh(); });
  }

  if (edit) {
    return (
      <tr className="bg-slate-50">
        <td className="px-3 py-2"><input value={sort} onChange={(e) => setSort(e.target.value)} type="number" className="w-14 rounded border border-slate-300 px-2 py-1 text-sm" /></td>
        <td className="px-3 py-2" colSpan={3}><input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" /></td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{option.usage_count}</td>
        <td className="px-3 py-2 text-right">
          <button onClick={save} disabled={pending} className="text-xs rounded bg-slate-900 text-white px-2.5 py-1">저장</button>
          <button onClick={() => setEdit(false)} className="text-xs text-slate-400 px-2">취소</button>
          {msg && <div className="text-[11px] text-rose-600">{msg}</div>}
        </td>
      </tr>
    );
  }
  return (
    <tr className={`hover:bg-slate-50 ${option.is_active ? "" : "opacity-50"}`}>
      <td className="px-3 py-2 tabular-nums text-slate-500">{option.sort_order}</td>
      <td className="px-3 py-2 font-medium">{option.label}</td>
      <td className="px-3 py-2">
        {option.is_active
          ? <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">사용</span>
          : <span className="text-[11px] rounded-full bg-zinc-200 text-zinc-600 px-2 py-0.5">비활성</span>}
      </td>
      <td className="px-3 py-2 text-slate-400">{option.created_at.slice(0, 10)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{option.usage_count.toLocaleString()}</td>
      <td className="px-3 py-2 text-right">
        {option.is_active && (
          <>
            <button onClick={() => setEdit(true)} className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1">수정</button>
            <button onClick={toggle} disabled={pending} className="text-xs text-rose-500 hover:text-rose-700 px-2 py-1 disabled:opacity-50">비활성</button>
          </>
        )}
      </td>
    </tr>
  );
}

function AddRow({ categoryKey }: { categoryKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function add(fd: FormData) {
    startTransition(async () => {
      const r = await createOptionAction(categoryKey, fd);
      setMsg(r.message);
      if (r.ok) { router.refresh(); (document.getElementById(`addopt-${categoryKey}`) as HTMLFormElement)?.reset(); }
    });
  }
  return (
    <form id={`addopt-${categoryKey}`} action={add} className="flex items-center gap-2 p-2.5 border-t border-slate-100 bg-slate-50">
      <input name="sort_order" type="number" placeholder="순서" className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      <input name="label" required placeholder="새 항목명" className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="text-sm rounded-lg bg-slate-900 text-white px-4 py-1.5 disabled:opacity-50">+ 추가</button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </form>
  );
}
