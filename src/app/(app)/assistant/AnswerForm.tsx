"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  generateAnswerAction,
  searchClientsAction,
  MODE_LABEL,
  type AnswerActionResult,
  type ClientMode,
} from "./actions";
import type { ClientSearchHit } from "@/lib/db/clients";

const MODES: { value: ClientMode; label: string; hint: string }[] = [
  { value: "auto", label: "자동판단", hint: "AI가 거래처 인식 후 결정" },
  { value: "general", label: "일반 문의", hint: "FAQ·과거 상담 우선" },
  { value: "key_client", label: "주거래처", hint: "거래처 지식베이스 우선" },
  { value: "new_candidate", label: "신규 거래처 후보", hint: "거래처 후보로 저장" },
];

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
  const [mode, setMode] = useState<ClientMode>("auto");
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<AnswerActionResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 주거래처 직접 검색/선택
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [cq, setCq] = useState("");
  const [cResults, setCResults] = useState<ClientSearchHit[]>([]);
  const [searching, startSearch] = useTransition();

  function pickMode(m: ClientMode) {
    setMode(m);
    if (m !== "key_client") {
      setSelectedClient(null);
      setCq("");
      setCResults([]);
    }
  }
  function doSearch(v: string) {
    setCq(v);
    if (v.trim().length < 1) {
      setCResults([]);
      return;
    }
    startSearch(async () => setCResults(await searchClientsAction(v)));
  }

  function submit() {
    setCopied(false);
    const sel = mode === "key_client" ? selectedClient?.id ?? null : null;
    startTransition(async () => setRes(await generateAnswerAction(question, mode, sel)));
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
        <div>
          <span className="block text-sm font-semibold mb-1.5">거래처 구분</span>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <label
                key={m.value}
                title={m.hint}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm flex items-center gap-1.5 ${
                  mode === m.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="client-mode"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => pickMode(m.value)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            기본 <b>자동판단</b> — 질문에서 거래처를 인식해 근거(지식베이스/FAQ)를 자동 선택합니다. 직접 선택해 바꿀 수 있습니다.
          </p>

          {/* 주거래처 선택 시 거래처 검색 */}
          {mode === "key_client" && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              {selectedClient ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">선택한 거래처</span>
                  <span className="font-medium">{selectedClient.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedClient(null)}
                    className="ml-auto text-xs text-slate-400 hover:text-rose-600"
                  >
                    변경
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={cq}
                    onChange={(e) => doSearch(e.target.value)}
                    placeholder="거래처명·담당자·연락처로 검색"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  {searching && <div className="mt-1 text-[11px] text-slate-400">검색 중…</div>}
                  {cResults.length > 0 && (
                    <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-50">
                      {cResults.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClient({ id: c.id, name: c.name });
                              setCResults([]);
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                          >
                            <span className="font-medium">{c.name}</span>
                            {(c.phone || c.contacts) && (
                              <span className="ml-2 text-xs text-slate-400">
                                {[c.phone, c.contacts].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {cq.trim() && !searching && cResults.length === 0 && (
                    <div className="mt-1 text-[11px] text-slate-400">검색 결과가 없습니다.</div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    선택하지 않으면 질문에서 자동 인식한 거래처를 사용합니다.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
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

      {res?.ok && res.recognition && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-indigo-900">거래처 인식 결과</span>
            <span
              className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                res.recognition.resolvedMode === "key_client"
                  ? "bg-emerald-100 text-emerald-700"
                  : res.recognition.resolvedMode === "new_candidate"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {MODE_LABEL[res.recognition.resolvedMode]}
            </span>
            <span className="text-[11px] text-slate-500">
              {res.recognition.auto ? "자동판단" : "직접 지정"}
            </span>
            <span className="ml-auto text-xs text-slate-500">
              신뢰도 {Math.round(res.recognition.confidence * 100)}%
            </span>
          </div>

          <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-400 w-16 shrink-0">매칭 거래처</span>
              <span>
                {res.recognition.matchedClientId ? (
                  <Link
                    href={`/clients/${res.recognition.matchedClientId}`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {res.recognition.matchedClientName}
                  </Link>
                ) : (
                  <span className="text-slate-400">없음(미등록)</span>
                )}
                {res.recognition.matchType && (
                  <span className="ml-1 text-[11px] text-slate-400">
                    {res.recognition.matchType === "phone"
                      ? "연락처 일치"
                      : res.recognition.matchType === "manual"
                        ? "직접 지정"
                        : "상호 일치"}
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-16 shrink-0">추출 식별</span>
              <span className="min-w-0 text-slate-600">
                {[
                  res.recognition.extracted.client_name,
                  res.recognition.extracted.manager_name,
                  res.recognition.extracted.phone,
                ]
                  .filter(Boolean)
                  .join(" · ") || <span className="text-slate-300">—</span>}
              </span>
            </div>
          </div>

          {res.basis && res.basis.length > 0 && (
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500">참고한 근거</span>
              {res.basis.map((b, i) => (
                <span
                  key={i}
                  className="text-[11px] rounded-full bg-white border border-slate-200 text-slate-600 px-2 py-0.5"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
          {res.recognition.prospectSaved && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              · 신규 거래처 후보로 저장했습니다. 거래처 관리에서 검토 후 등록하세요.
            </p>
          )}
        </div>
      )}

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
