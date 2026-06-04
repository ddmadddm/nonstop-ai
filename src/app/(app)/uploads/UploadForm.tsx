"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CONSULTATION_TYPES } from "@/lib/consultationTypes";
import { createConsultation, type SaveResult } from "./actions";

const ACCEPT = ["image/jpeg", "image/png"]; // jpg/jpeg/png
function isImage(f: File) {
  return ACCEPT.includes(f.type) || /\.(jpe?g|png)$/i.test(f.name);
}

interface Staged {
  file: File;
  url: string; // object URL for preview
}

export default function UploadForm({
  clientNames,
  defaultCreatedBy,
}: {
  clientNames: string[];
  defaultCreatedBy?: string;
}) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [clientName, setClientName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [type, setType] = useState("");
  const [content, setContent] = useState("");
  const [createdBy, setCreatedBy] = useState(defaultCreatedBy ?? "");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // object URL 정리
  useEffect(() => {
    return () => staged.forEach((s) => URL.revokeObjectURL(s.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter(isImage);
    if (incoming.length === 0) return;
    setStaged((prev) => [
      ...prev,
      ...incoming.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    setResult(null);
  }

  function removeStaged(idx: number) {
    setStaged((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function reset() {
    staged.forEach((s) => URL.revokeObjectURL(s.url));
    setStaged([]);
    setClientName("");
    setManagerName("");
    setType("");
    setContent("");
    setCreatedBy(defaultCreatedBy ?? "");
  }

  function handleSubmit() {
    const fd = new FormData();
    staged.forEach((s) => fd.append("images", s.file, s.file.name));
    fd.set("client_name", clientName);
    fd.set("manager_name", managerName);
    fd.set("consultation_type", type);
    fd.set("content", content); // 원문 그대로 전송
    fd.set("created_by", createdBy);
    startTransition(async () => {
      const res = await createConsultation(fd);
      setResult(res);
      if (res.ok) reset();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      {/* 1. 이미지 업로드 (클릭 + 드래그앤드롭) */}
      <div>
        <label className="block text-sm font-medium mb-1">
          상담 캡처 이미지 업로드{" "}
          <span className="text-slate-400">(JPG·JPEG·PNG, 여러 장 가능)</span>
        </label>
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
            addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-slate-900 bg-slate-50"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          <div className="text-2xl">📤</div>
          <div className="text-sm font-medium">
            클릭하거나 이미지를 끌어다 놓으세요
          </div>
          <div className="text-xs text-slate-400">JPG · JPEG · PNG</div>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = ""; // 같은 파일 재선택 허용
            }}
          />
        </div>

        {/* 미리보기 + 삭제 */}
        {staged.length > 0 && (
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
            {staged.map((s, i) => (
              <div key={s.url} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.url}
                  alt={s.file.name}
                  className="h-28 w-full rounded-lg border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeStaged(i)}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-600 text-white text-xs font-bold shadow hover:bg-rose-700"
                  title="삭제"
                >
                  ✕
                </button>
                <div className="mt-1 truncate text-[11px] text-slate-400">
                  {s.file.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. 거래처 / 담당자 */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">거래처</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            list="client-list"
            placeholder="입력 또는 선택 (예: 하림)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <datalist id="client-list">
            {clientNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">담당자</label>
          <input
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="예: 조용호"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* 3. 상담유형 / 등록자 */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">상담유형</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">선택하세요</option>
            {CONSULTATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">등록자</label>
          <input
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            placeholder="등록자 이름"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* 4. 상담내용 (원문 그대로) */}
      <div>
        <label className="block text-sm font-medium mb-1">
          상담내용{" "}
          <span className="text-slate-400">
            (원문 그대로 붙여넣기 · 줄바꿈 보존 · AI 가공 없음)
          </span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder="카카오 상담 대화 원문을 그대로 붙여넣으세요."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-y font-mono leading-relaxed"
        />
      </div>

      {/* 저장 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장하기"}
        </button>
        {result && (
          <span
            className={`text-sm ${result.ok ? "text-emerald-600" : "text-rose-600"}`}
          >
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}
