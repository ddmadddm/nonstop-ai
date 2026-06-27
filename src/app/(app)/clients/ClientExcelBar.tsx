"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportClientsAction, importClientsAction, type ImportResult } from "./actions";

export default function ClientExcelBar() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function download() {
    setMsg(null);
    startTransition(async () => {
      const r = await exportClientsAction();
      if (!r.ok || !r.base64) { setMsg(r.message); return; }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename ?? "거래처목록.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function upload(file: File) {
    setMsg(null);
    setResult(null);
    const fd = new FormData();
    fd.set("file", file, file.name);
    startTransition(async () => {
      const r = await importClientsAction(fd);
      setResult(r);
      setMsg(r.message);
      if (r.ok) router.refresh();
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={download}
        disabled={pending}
        className="rounded-lg border border-slate-300 text-sm px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
      >
        ⬇ 엑셀 다운로드
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={pending}
        className="rounded-lg border border-slate-300 text-sm px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
      >
        ⬆ 엑셀 업로드
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
      {msg && (
        <span className={`text-xs ${result && !result.ok ? "text-rose-600" : "text-slate-500"}`}>{msg}</span>
      )}
      {result && result.errors.length > 0 && (
        <details className="text-xs text-rose-600">
          <summary className="cursor-pointer">오류 {result.errors.length}건</summary>
          <ul className="mt-1 list-disc list-inside max-w-md">
            {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
