"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const MODE_OPTS = [
  { v: "", l: "거래처 전체" },
  { v: "auto", l: "자동판단" },
  { v: "general", l: "일반 문의" },
  { v: "key_client", l: "주거래처" },
  { v: "new_candidate", l: "신규 거래처 후보" },
];

const inputCls = "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm";

export default function DraftFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const init = (k: string) => sp.get(k) ?? "";

  const [dateStart, setDateStart] = useState(init("dateStart"));
  const [dateEnd, setDateEnd] = useState(init("dateEnd"));
  const [mode, setMode] = useState(init("mode"));
  const [clientName, setClientName] = useState(init("clientName"));
  const [keyword, setKeyword] = useState(init("keyword"));

  function apply() {
    const p = new URLSearchParams();
    const set = (k: string, v: string) => v.trim() && p.set(k, v.trim());
    set("dateStart", dateStart);
    set("dateEnd", dateEnd);
    set("mode", mode);
    set("clientName", clientName);
    set("keyword", keyword);
    router.push(`/assistant${p.toString() ? "?" + p.toString() : ""}#recent`);
  }
  function reset() {
    setDateStart("");
    setDateEnd("");
    setMode("");
    setClientName("");
    setKeyword("");
    router.push("/assistant#recent");
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") apply();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={dateStart}
          onChange={(e) => setDateStart(e.target.value)}
          className={inputCls}
          aria-label="시작일"
        />
        <span className="text-slate-400 text-xs">~</span>
        <input
          type="date"
          value={dateEnd}
          onChange={(e) => setDateEnd(e.target.value)}
          className={inputCls}
          aria-label="종료일"
        />
      </div>
      <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${inputCls} bg-white`}>
        {MODE_OPTS.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
      <input
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        onKeyDown={onKey}
        placeholder="거래처명"
        className={`${inputCls} w-28`}
      />
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={onKey}
        placeholder="질문/답변 키워드"
        className={`${inputCls} flex-1 min-w-[8rem]`}
      />
      <button onClick={apply} className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3.5 py-1.5">
        검색
      </button>
      <button onClick={reset} className="rounded-lg border border-slate-300 text-sm px-3 py-1.5 hover:bg-slate-50">
        초기화
      </button>
    </div>
  );
}
