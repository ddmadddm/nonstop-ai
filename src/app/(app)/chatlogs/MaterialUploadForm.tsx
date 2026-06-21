"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadMaterialAction } from "./material-actions";
import { ACCEPT_ATTR, SUPPORTED_EXTENSIONS, detectMaterial } from "@/lib/convert/detect";

type Phase = "queued" | "converting" | "extracting" | "done" | "failed";
interface Item {
  name: string;
  kind: string;
  phase: Phase;
  detail: string;
}

const KIND_ICON: Record<string, string> = { chat: "🗂️", audio: "🎙️", image: "🖼️", pdf: "📄" };

export default function MaterialUploadForm({ defaultCreatedBy }: { defaultCreatedBy?: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [createdBy, setCreatedBy] = useState(defaultCreatedBy ?? "");
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(list: FileList | null) {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (detectMaterial(f.name)) ok.push(f);
    }
    setFiles((prev) => [...prev, ...ok]);
  }

  function setItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function run() {
    if (files.length === 0) return;
    const init: Item[] = files.map((f) => ({
      name: f.name,
      kind: detectMaterial(f.name)?.kind ?? "chat",
      phase: "queued",
      detail: "대기 중",
    }));
    setItems(init);

    startTransition(async () => {
      for (let i = 0; i < files.length; i++) {
        // 변환 + AI 추출은 서버(uploadMaterialAction → convertMaterial)에서 한 번에 처리.
        setItem(i, { phase: "converting", detail: "원본 저장·변환·AI추출 중…" });
        const fd = new FormData();
        fd.set("file", files[i], files[i].name);
        fd.set("created_by", createdBy);
        const r = await uploadMaterialAction(fd);

        if (!r.ok) {
          setItem(i, {
            phase: "failed",
            detail: r.duplicate ? "중복 파일(이미 업로드됨)" : r.conversionError || r.message,
          });
          continue;
        }
        const ow = r.overwritten ? "덮어쓰기·" : "";
        const detail = r.extractionDeferred
          ? `${ow}원본 자료실에 보관(보관중) · 대형 채팅방은 추후 분석/분리/학습`
          : r.conversationId
            ? `${ow}변환·추출 완료`
            : `${ow}변환 완료`;
        setItem(i, { phase: "done", detail });
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

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
          pick(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <div className="text-2xl">📎</div>
        <div className="text-sm font-medium">클릭하거나 파일을 끌어다 놓으세요 (여러 개 가능)</div>
        <div className="text-xs text-slate-400">
          CSV·XLSX·TXT(메시지/카카오톡) · WAV·MP3·M4A(음성→STT) · PNG·JPG·PDF(이미지→OCR)
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => pick(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {KIND_ICON[detectMaterial(f.name)?.kind ?? "chat"]} {f.name}
            </span>
          ))}
        </div>
      )}

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
          onClick={run}
          disabled={pending || files.length === 0}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
        >
          {pending ? "처리 중…" : `업로드 + 변환 + AI 추출${files.length ? ` (${files.length})` : ""}`}
        </button>
        <span className="text-xs text-slate-400">
          지원: {SUPPORTED_EXTENSIONS.join(", ")}
        </span>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5 border-t border-slate-100 pt-3">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span>{KIND_ICON[it.kind]}</span>
              <span className="min-w-0 flex-1 truncate" title={it.name}>{it.name}</span>
              <span
                className={`text-xs ${
                  it.phase === "done"
                    ? "text-emerald-600"
                    : it.phase === "failed"
                      ? "text-rose-600"
                      : "text-slate-500"
                }`}
              >
                {it.phase === "converting" || it.phase === "extracting" ? "⏳ " : ""}
                {it.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
