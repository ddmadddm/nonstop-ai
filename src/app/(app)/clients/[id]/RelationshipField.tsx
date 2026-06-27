"use client";

import { useState, useTransition } from "react";
import { quickAddOptionAction } from "../../settings/client-options/actions";

// 관계/유입 구분 선택 + 인라인 '+ 항목 추가'. 새 항목 저장 → 즉시 선택 가능.
export default function RelationshipField({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string | null;
  options: { value: string; label: string }[];
}) {
  const [opts, setOpts] = useState(options);
  const [value, setValue] = useState(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const l = label.trim();
    if (!l) return;
    startTransition(async () => {
      const r = await quickAddOptionAction("relationship", l);
      if (r.ok) {
        if (!opts.some((o) => o.value === l)) setOpts((p) => [...p, { value: l, label: l }]);
        setValue(l);
        setLabel("");
        setAdding(false);
        setErr(null);
      } else setErr(r.message);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <select
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">미분류</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="mt-1 shrink-0 rounded-lg border border-slate-300 px-2.5 py-2 text-xs hover:bg-slate-50"
          title="새 관계/유입 항목 추가"
        >
          + 항목 추가
        </button>
      </div>
      {adding && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="새 항목명 (예: 제휴사)"
            className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <button type="button" onClick={add} disabled={pending} className="rounded-lg bg-slate-900 text-white text-xs px-3 py-1.5 disabled:opacity-50">저장</button>
          <button type="button" onClick={() => { setAdding(false); setErr(null); }} className="text-xs text-slate-400 px-1">취소</button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}
