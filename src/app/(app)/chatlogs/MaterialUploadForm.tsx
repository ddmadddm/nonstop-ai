"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadMaterialAction, type ClientMode } from "./material-actions";
import { ACCEPT_ATTR, SUPPORTED_EXTENSIONS, detectMaterial } from "@/lib/convert/detect";

type Phase = "queued" | "converting" | "extracting" | "done" | "failed";
interface Item {
  name: string;
  kind: string;
  phase: Phase;
  detail: string;
}

const KIND_ICON: Record<string, string> = { chat: "🗂️", audio: "🎙️", image: "🖼️", pdf: "📄" };

const MODE_OPTIONS: { value: ClientMode; label: string; hint: string }[] = [
  { value: "auto", label: "자동분류", hint: "AI가 추출값으로 기존 거래처와 자동 매칭" },
  { value: "existing", label: "기존 거래처 선택", hint: "선택한 거래처로 고정해 담당자/주소 매칭" },
  { value: "new", label: "신규 거래처 후보", hint: "자동매칭 없이 신규 후보로 등록(직원 확인)" },
];

export default function MaterialUploadForm({
  defaultCreatedBy,
  clients = [],
}: {
  defaultCreatedBy?: string;
  clients?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [createdBy, setCreatedBy] = useState(defaultCreatedBy ?? "");
  const [clientMode, setClientMode] = useState<ClientMode>("auto");
  const [clientId, setClientId] = useState("");
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
        fd.set("client_mode", clientMode);
        if (clientMode === "existing" && clientId) fd.set("client_id", clientId);
        const r = await uploadMaterialAction(fd);

        if (!r.ok) {
          setItem(i, {
            phase: "failed",
            detail: r.duplicate ? "중복 파일(이미 업로드됨)" : r.conversionError || r.message,
          });
          continue;
        }
        const ow = r.overwritten ? "덮어쓰기·" : "";
        const matchTag = r.matched ? " · 거래처 매칭 후보 생성" : "";
        const detail = r.extractionDeferred
          ? `${ow}원본 자료실에 보관(보관중) · 대형 채팅방은 추후 분석/분리/학습`
          : r.conversationId
            ? `${ow}변환·추출 완료${matchTag}`
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

      {/* 거래처 선택 — AI 추출값을 어떻게 매칭할지(기본: 자동분류) */}
      <div className="space-y-2">
        <div className="text-sm font-medium">거래처</div>
        <div className="flex flex-wrap gap-2">
          {MODE_OPTIONS.map((m) => (
            <label
              key={m.value}
              title={m.hint}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${
                clientMode === m.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="client_mode"
                value={m.value}
                checked={clientMode === m.value}
                onChange={() => setClientMode(m.value)}
                className="hidden"
              />
              {m.label}
            </label>
          ))}
        </div>
        {clientMode === "existing" && (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full sm:w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">거래처를 선택하세요…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <p className="text-xs text-slate-400">
          {MODE_OPTIONS.find((m) => m.value === clientMode)?.hint}
          {clientMode === "existing" && !clientId
            ? " — 거래처 미선택 시 자동분류로 처리됩니다."
            : ""}
        </p>
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
