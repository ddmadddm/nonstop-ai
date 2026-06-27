"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reconvertMaterialAction } from "./material-actions";
import { runExtractionAction } from "./extraction-actions";

// '변환실패' 자료 행의 '다시 변환' 버튼.
//   STT 키(.env)를 나중에 채운 뒤 등에 재업로드 없이 원본 보관본으로 재변환한다.
//   성공하면 이어서 AI 추출까지 실행한 뒤 목록을 새로고침한다.
export default function ReconvertMaterialButton({
  materialId,
  filename,
}: {
  materialId: string;
  filename: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onReconvert() {
    setError(null);
    startTransition(async () => {
      const r = await reconvertMaterialAction(materialId);
      if (!r.ok) {
        setError(r.conversionError || r.message);
        return;
      }
      if (r.conversationId) await runExtractionAction(r.conversationId);
      router.refresh();
    });
  }

  return (
    <div className="shrink-0 flex items-center">
      <button
        type="button"
        onClick={onReconvert}
        disabled={pending}
        title="다시 변환"
        aria-label={`${filename} 다시 변환`}
        className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-50"
      >
        {pending ? "변환중…" : "↻"}
      </button>
      {error && <span className="ml-1 text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
