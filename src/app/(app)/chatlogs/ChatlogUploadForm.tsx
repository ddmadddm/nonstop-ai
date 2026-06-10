"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadChatlog, type UploadResult } from "./actions";
import { runExtractionAction } from "./extraction-actions";

function isSupported(f: File) {
  return /\.(xlsx|csv|txt)$/i.test(f.name);
}

export default function ChatlogUploadForm({
  defaultCreatedBy,
}: {
  defaultCreatedBy?: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [createdBy, setCreatedBy] = useState(defaultCreatedBy ?? "");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // 업로드 후 자동추출 진행률
  const [extract, setExtract] = useState<{
    total: number;
    done: number;
    failed: number;
    running: boolean;
  } | null>(null);

  function pick(f: File | null) {
    if (f && !isSupported(f)) {
      setResult({ ok: false, message: ".xlsx · .csv(UTF-8) · .txt 파일만 가능합니다." });
      return;
    }
    setFile(f);
    setResult(null);
    setExtract(null);
  }

  // 업로드 성공 후, 생성된 대화들을 순차 자동추출(진행률 표시). 실패해도 계속 진행.
  async function autoExtract(ids: string[]) {
    if (ids.length === 0) {
      router.refresh();
      return;
    }
    setExtract({ total: ids.length, done: 0, failed: 0, running: true });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      const r = await runExtractionAction(ids[i]);
      if (!r.ok) failed++;
      setExtract({ total: ids.length, done: i + 1, failed, running: i + 1 < ids.length });
    }
    router.refresh();
  }

  function handleSubmit() {
    if (!file) {
      setResult({ ok: false, message: "파일을 선택해 주세요." });
      return;
    }
    const fd = new FormData();
    fd.set("file", file, file.name);
    fd.set("created_by", createdBy);
    startTransition(async () => {
      const res = await uploadChatlog(fd);
      setResult(res);
      if (res.ok) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        // 업로드 완료 → 자동 추출 시작(업로드 성공은 추출과 무관하게 확정)
        await autoExtract(res.conversationIds ?? []);
      }
    });
  }

  const pct = extract ? Math.round((extract.done / extract.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0] ?? null);
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-slate-900 bg-slate-50"
            : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <div className="text-2xl">🗂️</div>
        <div className="text-sm font-medium">
          {file ? file.name : "클릭하거나 파일을 끌어다 놓으세요"}
        </div>
        <div className="text-xs text-slate-400">
          카카오 상담톡 원본 · .xlsx · .csv(UTF-8) · .txt · 컬럼: DATE / USER / MESSAGE
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
          }}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">등록자</label>
          <input
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            placeholder="업로드한 사람 이름"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !file || extract?.running}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
        >
          {pending ? "업로드 중…" : "업로드 + AI 추출"}
        </button>
        {result && (
          <span
            className={`text-sm ${
              result.ok
                ? "text-emerald-600"
                : result.duplicate
                  ? "text-amber-600"
                  : "text-rose-600"
            }`}
          >
            {result.message}
          </span>
        )}
      </div>

      {/* 자동추출 진행률 */}
      {extract && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {extract.running
                ? `AI 추출 중… (${extract.done}/${extract.total})`
                : `AI 추출 완료 — 성공 ${extract.done - extract.failed} · 추출대기 ${extract.failed}`}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all ${
                extract.running ? "bg-slate-900" : extract.failed ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {!extract.running && extract.failed > 0 && (
            <p className="text-[11px] text-amber-600">
              일부 추출이 실패했습니다(추출대기). 각 대화에서 수동으로 다시 시도할 수 있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
