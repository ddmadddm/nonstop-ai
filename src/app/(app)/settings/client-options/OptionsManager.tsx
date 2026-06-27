"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OptionCategory, ClientOption } from "@/lib/db/client-options";
import { createOptionAction, updateOptionAction, deactivateOptionAction } from "./actions";

export default function OptionsManager({
  categories,
  byCat,
}: {
  categories: OptionCategory[];
  byCat: Record<string, ClientOption[]>;
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
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {options.length === 0 && <div className="p-4 text-sm text-slate-400">항목이 없습니다.</div>}
            {options.map((o) => (
              <OptionRow key={o.id} option={o} />
            ))}
          </div>
          <AddRow categoryKey={cat.key} />
        </div>
      )}
    </div>
  );
}

function OptionRow({ option }: { option: ClientOption }) {
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
    if (!confirm(`'${option.label}' 항목을 비활성화할까요? (사용 중이어도 기존 거래처 값은 유지됩니다)`)) return;
    startTransition(async () => { await deactivateOptionAction(option.id); router.refresh(); });
  }

  if (edit) {
    return (
      <div className="flex items-center gap-2 p-2.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        <input value={sort} onChange={(e) => setSort(e.target.value)} type="number" className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" title="정렬순서" />
        <button onClick={save} disabled={pending} className="text-xs rounded-lg bg-slate-900 text-white px-3 py-1.5">저장</button>
        <button onClick={() => setEdit(false)} className="text-xs text-slate-400 px-2">취소</button>
        {msg && <span className="text-xs text-rose-600">{msg}</span>}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 p-3 text-sm ${option.is_active ? "" : "opacity-50"}`}>
      <span className="font-medium">{option.label}</span>
      {option.value !== option.label && <span className="text-xs text-slate-400">({option.value})</span>}
      <span className="text-[11px] text-slate-400">정렬 {option.sort_order}</span>
      {!option.is_active && <span className="text-[11px] rounded-full bg-zinc-200 text-zinc-600 px-2 py-0.5">비활성</span>}
      {option.is_active && (
        <div className="ml-auto flex gap-1">
          <button onClick={() => setEdit(true)} className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1">수정</button>
          <button onClick={toggle} disabled={pending} className="text-xs text-rose-500 hover:text-rose-700 px-2 py-1 disabled:opacity-50">비활성화</button>
        </div>
      )}
    </div>
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
      <input name="label" required placeholder="새 항목명" className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      <input name="sort_order" type="number" placeholder="정렬" className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="text-sm rounded-lg bg-slate-900 text-white px-4 py-1.5 disabled:opacity-50">+ 추가</button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </form>
  );
}
