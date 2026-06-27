"use client";

import { useState, useTransition } from "react";
import type { MatchCandidate } from "@/lib/db/clients";
import {
  confirmCandidateMatchAction,
  saveCandidateAsNewAction,
  rejectCandidateAction,
  type ActionResult,
} from "./actions";

const FIELD_LABEL: Record<string, string> = {
  client: "거래처",
  contact: "담당자",
  origin: "출발지",
  destination: "도착지",
};
const MATCH_LABEL: Record<string, { text: string; cls: string }> = {
  exact: { text: "정확 일치", cls: "bg-emerald-100 text-emerald-700" },
  similar: { text: "유사 추천", cls: "bg-amber-100 text-amber-700" },
  new: { text: "신규 후보", cls: "bg-sky-100 text-sky-700" },
};
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  confirmed: { text: "확인됨", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { text: "무시됨", cls: "bg-slate-200 text-slate-500" },
};

function matchedName(c: MatchCandidate): string | null {
  if (c.field_type === "client") return c.matched_client_name;
  if (c.field_type === "contact") return c.matched_contact_name;
  return c.matched_address_label;
}

function CandidateRow({
  c,
  clients,
}: {
  c: MatchCandidate;
  clients: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [showNew, setShowNew] = useState(false);

  const match = MATCH_LABEL[c.match_type];
  const mName = matchedName(c);
  const needsTarget = c.field_type !== "client"; // 담당자/주소는 대상 거래처 필요

  function confirmMatch() {
    startTransition(async () => setResult(await confirmCandidateMatchAction(c.id)));
  }
  function reject() {
    startTransition(async () => setResult(await rejectCandidateAction(c.id)));
  }
  function saveNew(fd: FormData) {
    startTransition(async () => setResult(await saveCandidateAsNewAction(c.id, fd)));
  }

  const resolved = c.status !== "pending";

  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">
          {FIELD_LABEL[c.field_type]}
        </span>
        <span className="font-medium">{c.extracted_value ?? "(없음)"}</span>
        {c.extracted_phone && (
          <span className="text-xs text-slate-400">{c.extracted_phone}</span>
        )}
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${match.cls}`}>
          {match.text}
          {c.match_score != null && ` ${Math.round(c.match_score * 100)}%`}
        </span>
        {resolved && STATUS_LABEL[c.status] && (
          <span
            className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_LABEL[c.status].cls}`}
          >
            {STATUS_LABEL[c.status].text}
          </span>
        )}
        {c.conversation_title && (
          <span className="text-[11px] text-slate-400 ml-auto truncate max-w-[40%]">
            {c.conversation_title}
          </span>
        )}
      </div>

      {mName && (
        <div className="mt-1 text-xs text-slate-500">
          추천 연결: <span className="font-medium text-slate-700">{mName}</span>
          {c.matched_client_name && c.field_type !== "client" && (
            <span className="text-slate-400"> · {c.matched_client_name}</span>
          )}
        </div>
      )}

      {!resolved && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {mName && (
            <button
              onClick={confirmMatch}
              disabled={pending}
              className="rounded-lg bg-slate-900 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
            >
              기존에 연결
            </button>
          )}
          <button
            onClick={() => setShowNew((v) => !v)}
            disabled={pending}
            className="rounded-lg border border-slate-300 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            신규 저장
          </button>
          <button
            onClick={reject}
            disabled={pending}
            className="rounded-lg border border-slate-200 text-slate-500 text-xs px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            무시
          </button>
          {result && (
            <span
              className={`text-xs ${result.ok ? "text-emerald-600" : "text-rose-600"}`}
            >
              {result.message}
            </span>
          )}
        </div>
      )}

      {!resolved && showNew && (
        <form
          action={saveNew}
          className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
        >
          {needsTarget && (
            <label className="block text-xs">
              <span className="text-slate-500">대상 거래처</span>
              <select
                name="clientId"
                defaultValue={c.matched_client_id ?? ""}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                <option value="">선택…</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(c.field_type === "origin" || c.field_type === "destination") && (
            <label className="block text-xs">
              <span className="text-slate-500">주소 별칭(미입력 시 주소로 저장)</span>
              <input
                name="label"
                placeholder="예: 본사, 1공장, 서울사무소"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          )}
          <p className="text-[11px] text-slate-400">
            {c.field_type === "client"
              ? "새 거래처로 등록합니다."
              : c.field_type === "contact"
                ? "선택한 거래처의 담당자로 저장합니다."
                : "선택한 거래처의 주소록에 저장합니다."}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장하기"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function MatchCandidates({
  candidates,
  clients,
  emptyText = "AI 매칭 후보가 없습니다.",
}: {
  candidates: MatchCandidate[];
  clients: { id: string; name: string }[];
  emptyText?: string;
}) {
  if (candidates.length === 0) {
    return <div className="p-4 text-sm text-slate-400">{emptyText}</div>;
  }
  return (
    <div className="divide-y divide-slate-100">
      {candidates.map((c) => (
        <CandidateRow key={c.id} c={c} clients={clients} />
      ))}
    </div>
  );
}
