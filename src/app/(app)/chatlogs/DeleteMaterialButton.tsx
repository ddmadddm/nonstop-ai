"use client";

import { useState, useTransition } from "react";
import { deleteMaterialAction } from "./material-actions";

// 업로드 자료 행의 삭제 버튼. 확인 후 비활성화(소프트삭제). 실패 시 메시지 표시.
export default function DeleteMaterialButton({
  materialId,
  filename,
}: {
  materialId: string;
  filename: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`"${filename}" 자료를 삭제할까요?\n연결된 대화·추출 결과도 함께 가려집니다.`))
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteMaterialAction(materialId);
      if (!r.ok) setError(r.message);
    });
  }

  return (
    <div className="shrink-0 flex items-center">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        title="삭제"
        aria-label={`${filename} 삭제`}
        className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      >
        {pending ? "삭제중…" : "🗑"}
      </button>
      {error && <span className="ml-1 text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
