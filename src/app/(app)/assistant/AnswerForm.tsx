"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { generateAnswerAction, type AnswerActionResult } from "./actions";

const FIELDS: { key: string; label: string }[] = [
  { key: "client_name", label: "거래처명" },
  { key: "manager_name", label: "담당자명" },
  { key: "phone", label: "연락처" },
  { key: "origin", label: "출발지" },
  { key: "destination", label: "도착지" },
  { key: "vehicle_type", label: "차량종류" },
  { key: "consultation_type", label: "상담유형" },
];

function confTone(c: number): string {
  return c >= 0.85
    ? "text-emerald-600"
    : c >= 0.7
      ? "text-amber-600"
      : "text-rose-600 font-medium";
}

const SAMPLE =
  "안녕하세요, 강남 역삼동에서 인천공항까지 1톤 화물 지금 바로 보내고 싶은데 가능할까요? 급합니다.";

export default function AnswerForm() {
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<AnswerActionResult | null>(null);
  const [copied, setCopied] = useState(false);

  function submit() {
    setCopied(false);
    startTransition(async () => setRes(await generateAnswerAction(question)));
  }

  function copyAnswer() {
    if (!res?.answer) return;
    navigator.clipboard.writeText(res.answer).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const conf = res?.confidence ?? {};
  const fields = (res?.fields ?? {}) as Record<string, string | boolean | null>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="block text-sm font-semibold">상담 문의(질문)</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="고객 문의 내용을 붙여넣거나 입력하세요. 예) 마포에서 부산까지 다마스 내일 오전 배차 가능한가요?"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={submit}
            disabled={pending || !question.trim()}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
          >
            {pending ? "논사원이 답변 작성 중…" : "1차 답변 생성"}
          </button>
          <button
            type="button"
            onClick={() => setQuestion(SAMPLE)}
            className="text-xs text-slate-500 underline"
          >
            예시 질문 채우기
          </button>
          {res && !res.ok && (
            <span className="text-sm text-rose-600">{res.message}</span>
          )}
        </div>
      </div>

      {res?.ok && (
        <>
          {/* ① 답변문 초안 */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
              <span className="text-sm font-semibold">논사원 1차 답변문 (초안)</span>
              <span className="text-[11px] text-slate-400">
                검토 후 고객에게 전송하세요
              </span>
              <button
                onClick={copyAnswer}
                className="ml-auto text-xs rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
              >
                {copied ? "복사됨 ✓" : "복사"}
              </button>
            </div>
            <p className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {res.answer}
            </p>
          </div>

          {/* ② 질문에서 파악한 배차 항목 */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-2 border-b border-slate-100">
              <span className="text-sm font-semibold">파악한 배차 항목</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {FIELDS.map((f) => {
                const c = (conf as Record<string, number>)[f.key] ?? 0;
                const v = fields[f.key];
                return (
                  <div
                    key={f.key}
                    className="flex items-center justify-between gap-2 border-b border-slate-50 py-1"
                  >
                    <span className="text-xs text-slate-500 shrink-0">{f.label}</span>
                    <span className="text-sm text-right">
                      {v ? String(v) : <span className="text-slate-300">—</span>}
                      {v && (
                        <span className={`ml-2 text-[11px] ${confTone(c)}`}>
                          {Math.round(c * 100)}%
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between gap-2 border-b border-slate-50 py-1">
                <span className="text-xs text-slate-500 shrink-0">긴급여부</span>
                <span className="text-sm text-right">
                  {fields.is_urgent === true ? (
                    <span className="text-rose-600 font-medium">긴급</span>
                  ) : fields.is_urgent === false ? (
                    "일반"
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                  {fields.is_urgent !== null && fields.is_urgent !== undefined && (
                    <span
                      className={`ml-2 text-[11px] ${confTone((conf as Record<string, number>).is_urgent ?? 0)}`}
                    >
                      {Math.round(((conf as Record<string, number>).is_urgent ?? 0) * 100)}%
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* ③ 참고한 과거 상담 출처 */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
              <span className="text-sm font-semibold">참고한 과거 상담</span>
              <span className="text-[11px] text-slate-400">
                관련 후보 {res.matchedTotal ?? 0}건 중 상위 {res.sources?.length ?? 0}건 표시
              </span>
            </div>
            {(res.sources?.length ?? 0) === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                관련된 과거 상담 기록을 찾지 못했습니다. 자료를 더 업로드하면 답변 근거가
                풍부해집니다.
              </p>
            ) : (
              <ul className="p-2">
                {res.sources!.map((s, i) => (
                  <li key={i} className="px-2 py-1.5 text-sm flex items-start gap-2">
                    {s.used && (
                      <span className="mt-0.5 shrink-0 text-[10px] rounded bg-emerald-100 text-emerald-700 px-1">
                        근거사용
                      </span>
                    )}
                    <Link
                      href={`/chatlogs/${s.conversation_id}`}
                      className="text-slate-600 hover:text-slate-900 hover:underline"
                    >
                      {s.excerpt}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
