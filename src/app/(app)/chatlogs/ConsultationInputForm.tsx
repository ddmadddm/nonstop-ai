"use client";

import { useState, useTransition } from "react";
import { createConsultation, type SaveResult } from "./consultation-actions";

// 직접 입력 — 상담 원문만 기록(이미지/거래처/담당자/상담유형/등록자 입력 제거).
//   등록자는 서버에서 로그인 사용자로 자동 기록. 원문 그대로 보존(AI 가공 없음).
export default function ConsultationInputForm() {
  const [content, setContent] = useState("");
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!content.trim()) {
      setResult({ ok: false, message: "상담내용을 입력해 주세요." });
      return;
    }
    const fd = new FormData();
    fd.set("content", content); // 원문 그대로 전송
    startTransition(async () => {
      const res = await createConsultation(fd);
      setResult(res);
      if (res.ok) setContent("");
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
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
          <span className={`text-sm ${result.ok ? "text-emerald-600" : "text-rose-600"}`}>
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}
