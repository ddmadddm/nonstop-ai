"use client";

import { useState } from "react";
import { cx } from "@/lib/utils";

interface FaqRef {
  id: string;
  question: string;
}

export default function AiDraftPanel({
  initialText,
  confidence,
  faqs,
}: {
  initialText: string;
  confidence: number;
  faqs: FaqRef[];
}) {
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<"draft" | "accepted" | "discarded">(
    "draft",
  );

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-violet-800">
            🤖 논사원 AI 답변 초안
          </span>
          <span className="text-xs text-violet-600">
            신뢰도 {Math.round(confidence * 100)}%
          </span>
        </div>
        {state === "accepted" && (
          <span className="text-xs font-medium text-emerald-600">
            ✓ 발송 처리됨
          </span>
        )}
        {state === "discarded" && (
          <span className="text-xs font-medium text-slate-400">폐기됨</span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={state !== "draft"}
        rows={Math.min(12, text.split("\n").length + 1)}
        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm resize-y disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-300"
      />

      {faqs.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium text-slate-500 mb-1">
            참고 FAQ
          </div>
          <ul className="space-y-1">
            {faqs.map((f) => (
              <li
                key={f.id}
                className="text-xs text-slate-600 bg-white rounded border border-slate-200 px-2 py-1"
              >
                Q. {f.question}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state === "draft" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setState("accepted")}
            className="flex-1 rounded-lg bg-violet-600 text-white text-sm font-medium py-2 hover:bg-violet-700"
          >
            채택 후 발송
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(text);
            }}
            className="rounded-lg border border-slate-300 bg-white text-sm px-3 py-2 hover:bg-slate-50"
          >
            복사
          </button>
          <button
            onClick={() => setState("discarded")}
            className="rounded-lg border border-slate-300 bg-white text-sm px-3 py-2 text-slate-500 hover:bg-slate-50"
          >
            폐기
          </button>
        </div>
      )}

      {state !== "draft" && (
        <button
          onClick={() => setState("draft")}
          className={cx(
            "mt-3 text-xs text-slate-500 hover:text-slate-900 underline",
          )}
        >
          되돌리기
        </button>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        ※ 목업 모드: 실제 발송은 카카오 연동 후 동작합니다. 현재는 초안 검토 UI
        시연용입니다.
      </p>
    </div>
  );
}
