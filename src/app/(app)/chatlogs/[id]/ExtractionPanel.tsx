"use client";

import { useState, useTransition } from "react";
import type { Extraction } from "@/lib/db/extractions";
import type { MatchCandidate } from "@/lib/db/clients";
import {
  runExtractionAction,
  saveExtractionAction,
  confirmExtractionAction,
  type ActionResult,
} from "../extraction-actions";
import { generateMatchesAction } from "../../clients/actions";
import MatchCandidates from "../../clients/MatchCandidates";

const FIELDS: { key: string; label: string }[] = [
  { key: "client_name", label: "거래처명" },
  { key: "manager_name", label: "담당자명" },
  { key: "phone", label: "연락처" },
  { key: "origin", label: "출발지" },
  { key: "destination", label: "도착지" },
  { key: "vehicle_type", label: "차량종류" },
  { key: "consultation_type", label: "상담유형" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  extracted: "추출됨",
  edited: "수정됨",
  confirmed: "확정",
  failed: "실패",
};

export default function ExtractionPanel({
  conversationId,
  extraction,
  candidates,
  clientOptions,
}: {
  conversationId: string;
  extraction: Extraction | null;
  candidates: MatchCandidate[];
  clientOptions: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const conf = extraction?.ai_confidence ?? {};
  const sources = extraction?.field_sources ?? {};

  function run() {
    startTransition(async () => setResult(await runExtractionAction(conversationId)));
  }
  function match() {
    startTransition(async () => setResult(await generateMatchesAction(conversationId)));
  }
  function save(formData: FormData) {
    startTransition(async () =>
      setResult(await saveExtractionAction(conversationId, formData)),
    );
  }
  function confirm() {
    startTransition(async () => setResult(await confirmExtractionAction(conversationId)));
  }

  function confidenceBadge(key: string) {
    const c = (conf as Record<string, number>)[key];
    if (typeof c !== "number") return null;
    // 70% 미만은 검수필수(빨강), 85% 미만 주의(주황)
    const tone =
      c >= 0.85 ? "text-emerald-600" : c >= 0.7 ? "text-amber-600" : "text-rose-600 font-medium";
    return <span className={`text-[11px] ${tone}`}>AI {Math.round(c * 100)}%</span>;
  }
  function sourceBadge(key: string) {
    if ((sources as Record<string, string>)[key] === "human")
      return (
        <span className="text-[11px] rounded bg-violet-100 text-violet-700 px-1">수정됨</span>
      );
    return null;
  }

  return (
    <>
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
        <span className="text-sm font-semibold">상담 데이터 (AI 추출)</span>
        {extraction && (
          <span
            className={`text-xs rounded-full px-2 py-0.5 ${
              extraction.status === "confirmed"
                ? "bg-emerald-100 text-emerald-700"
                : extraction.status === "failed"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {STATUS_LABEL[extraction.status] ?? extraction.status}
          </span>
        )}
        {extraction?.ai_model && (
          <span className="text-[11px] text-slate-400 ml-auto">{extraction.ai_model}</span>
        )}
      </div>

      {!extraction ? (
        <div className="p-6 text-center space-y-3">
          <p className="text-sm text-slate-500">
            아직 추출하지 않았습니다. 대화 원문에서 8개 항목을 AI로 추출합니다.
          </p>
          <button
            onClick={run}
            disabled={pending}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50"
          >
            {pending ? "추출 중…" : "AI 추출 실행"}
          </button>
          {result && (
            <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {result.message}
            </p>
          )}
        </div>
      ) : (
        <form action={save} className="p-4 space-y-3">
          {extraction.needs_review && extraction.status !== "confirmed" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <div className="font-semibold mb-0.5">검수필수</div>
              <ul className="list-disc list-inside space-y-0.5">
                {(extraction.review_reasons ?? []).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p className="mt-1 text-rose-500">
                확정 전에는 배차 데이터로 사용되지 않습니다. 값을 확인·수정 후 확정하세요.
              </p>
            </div>
          )}
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="flex items-center gap-2 text-sm font-medium mb-1">
                {f.label}
                {confidenceBadge(f.key)}
                {sourceBadge(f.key)}
              </label>
              <input
                name={f.key}
                defaultValue={(extraction[f.key as keyof Extraction] as string) ?? ""}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ))}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-1">
              긴급여부
              {confidenceBadge("is_urgent")}
              {sourceBadge("is_urgent")}
            </label>
            <select
              name="is_urgent"
              defaultValue={
                extraction.is_urgent === null ? "" : String(extraction.is_urgent)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">미상</option>
              <option value="true">긴급</option>
              <option value="false">일반</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="rounded-lg border border-slate-300 text-sm font-medium px-4 py-2 disabled:opacity-50 hover:bg-slate-50"
            >
              AI 재추출
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending || extraction.status === "confirmed"}
              className="rounded-lg border border-emerald-300 text-emerald-700 text-sm font-medium px-4 py-2 disabled:opacity-50 hover:bg-emerald-50"
            >
              {extraction.status === "confirmed" ? "확정됨" : "확정"}
            </button>
            <button
              type="button"
              onClick={match}
              disabled={pending}
              className="rounded-lg border border-sky-300 text-sky-700 text-sm font-medium px-4 py-2 disabled:opacity-50 hover:bg-sky-50"
            >
              거래처 매칭
            </button>
            {result && (
              <span className={`text-sm ${result.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {result.message}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            ※ 원본 대화는 수정되지 않습니다. 값 수정 시 변경 이력이 자동 저장됩니다.
          </p>
        </form>
      )}
    </div>

      {/* 거래처 AI 매칭 후보 — '거래처 매칭' 실행 시 생성 */}
      {extraction && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
            <span className="text-sm font-semibold">거래처 매칭 후보</span>
            <span className="text-[11px] text-slate-400 ml-auto">
              업체명·담당자·출발지·도착지를 기존 거래처와 매칭
            </span>
          </div>
          <MatchCandidates
            candidates={candidates}
            clients={clientOptions}
            emptyText="아직 매칭 후보가 없습니다. ‘거래처 매칭’을 실행하세요."
          />
        </div>
      )}
    </>
  );
}
