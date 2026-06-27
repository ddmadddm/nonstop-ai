"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils";
import { STATUS_META, type DisplayStatus } from "@/lib/materials-status";
import type { ArchiveAnalysis, SegmentRow, SegMsg } from "@/lib/db/segments";
import type { MatchCandidate } from "@/lib/db/clients";
import MatchCandidates from "../../clients/MatchCandidates";
import {
  runArchivePipelineAction,
  loadSegmentMessagesAction,
  runSegmentExtractionAction,
  generateSegmentMatchesAction,
  loadSegmentCandidatesAction,
  assignArchiveClientAction,
  createClientFromArchiveAction,
  type ArchiveActionResult,
} from "../archive-actions";

const EXT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "대기", cls: "bg-slate-100 text-slate-600" },
  extracted: { label: "추출됨", cls: "bg-sky-100 text-sky-700" },
  edited: { label: "수정됨", cls: "bg-violet-100 text-violet-700" },
  confirmed: { label: "확정", cls: "bg-emerald-600 text-white" },
  failed: { label: "실패", cls: "bg-rose-100 text-rose-700" },
};

const TRIGGER_LABEL: Record<string, string> = {
  start: "시작",
  gap: "시간공백",
  dispatch: "배차후",
  intake: "새접수",
  sender: "거래처변경",
  order: "주문",
};

function ymd(s: string | null): string {
  return s ? s.slice(0, 10) : "—";
}

function SegmentItem({
  conversationId,
  seg,
  clientOptions,
}: {
  conversationId: string;
  seg: SegmentRow;
  clientOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<SegMsg[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [extracting, startExtract] = useTransition();
  const [extResult, setExtResult] = useState<ArchiveActionResult | null>(null);
  const [matching, startMatch] = useTransition();
  const [matchResult, setMatchResult] = useState<ArchiveActionResult | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !msgs) {
      startTransition(async () =>
        setMsgs(await loadSegmentMessagesAction(conversationId, seg.start_seq, seg.end_seq)),
      );
    }
    if (next && seg.ext_status && candidates === null) {
      startMatch(async () => setCandidates(await loadSegmentCandidatesAction(seg.id)));
    }
  }
  function extract() {
    startExtract(async () => {
      const r = await runSegmentExtractionAction(conversationId, seg.id, seg.start_seq, seg.end_seq);
      setExtResult(r);
      if (r.ok) router.refresh();
    });
  }
  function match() {
    startMatch(async () => {
      const r = await generateSegmentMatchesAction(conversationId, seg.id);
      setMatchResult(r);
      setCandidates(await loadSegmentCandidatesAction(seg.id));
      setOpen(true);
    });
  }

  const es = seg.ext_status ? EXT_STATUS[seg.ext_status] : null;
  const fields = [
    seg.ext_client && `거래처 ${seg.ext_client}`,
    seg.ext_origin && `출발 ${seg.ext_origin}`,
    seg.ext_destination && `도착 ${seg.ext_destination}`,
    seg.ext_vehicle && `차종 ${seg.ext_vehicle}`,
  ].filter(Boolean);

  return (
    <div className="text-sm">
      <div className="px-4 py-3 hover:bg-slate-50 flex items-center gap-2">
        <button onClick={toggle} className="min-w-0 flex-1 flex items-center gap-2 text-left">
          <span className="text-xs text-slate-400 w-10 shrink-0">#{seg.seq + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{seg.client_hint ?? "고객"}</span>
              <span className="text-xs text-slate-400">
                {seg.started_at ? formatDateTime(seg.started_at) : "시각미상"}
              </span>
              {seg.signals?.dispatch && (
                <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5">
                  배차완료
                </span>
              )}
              {(seg.signals?.order || seg.signals?.intake) && (
                <span className="text-[11px] rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5">
                  주문
                </span>
              )}
              {es && (
                <span className={`text-[11px] rounded-full px-1.5 py-0.5 ${es.cls}`}>{es.label}</span>
              )}
              {seg.ext_needs_review && seg.ext_status !== "confirmed" && (
                <span className="text-[11px] rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5">
                  검수필수
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {seg.message_count}개 메시지 · seq {seg.start_seq}–{seg.end_seq}
              {seg.triggers?.length > 0 && (
                <span className="ml-1">
                  · {seg.triggers.map((t) => TRIGGER_LABEL[t] ?? t).join(", ")}
                </span>
              )}
            </div>
            {fields.length > 0 && (
              <div className="text-xs text-slate-600 mt-1 truncate">{fields.join(" · ")}</div>
            )}
          </div>
          <span className="text-slate-400 text-xs shrink-0">{open ? "▲" : "▼"}</span>
        </button>
        <button
          onClick={extract}
          disabled={extracting}
          className="shrink-0 rounded-lg border border-slate-300 text-xs font-medium px-2.5 py-1.5 hover:bg-white disabled:opacity-50"
          title="이 상담 단위만 AI로 추출"
        >
          {extracting ? "추출 중…" : seg.ext_status ? "재추출" : "AI 추출"}
        </button>
        {seg.ext_status && (
          <button
            onClick={match}
            disabled={matching}
            className="shrink-0 rounded-lg border border-sky-300 text-sky-700 text-xs font-medium px-2.5 py-1.5 hover:bg-sky-50 disabled:opacity-50"
            title="추출 결과를 기존 거래처와 매칭"
          >
            {matching ? "매칭 중…" : "거래처 매칭"}
          </button>
        )}
      </div>
      {extResult && !extResult.ok && (
        <div className="px-4 pb-2 text-xs text-rose-600">{extResult.message}</div>
      )}
      {matchResult && (
        <div className={`px-4 pb-2 text-xs ${matchResult.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {matchResult.message}
        </div>
      )}
      {open && (
        <div className="px-4 pb-3 bg-slate-50/60">
          {pending && !msgs && <div className="text-xs text-slate-400 py-2">불러오는 중…</div>}
          {msgs && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto py-2">
              {msgs.map((m, i) => {
                const staff = m.sender_type === "staff";
                return (
                  <div key={i} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
                        staff ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-800"
                      }`}
                    >
                      <div className="text-[10px] opacity-70 mb-0.5">
                        {staff ? "직원" : "고객"}
                        {m.sender_name ? ` · ${m.sender_name}` : ""}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* ⑥ 거래처 매칭 후보 */}
          {matching && candidates === null && (
            <div className="text-xs text-slate-400 py-2">매칭 후보 불러오는 중…</div>
          )}
          {candidates && candidates.length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white">
              <div className="px-3 py-1.5 border-b border-slate-100 text-xs font-semibold text-slate-600">
                거래처 매칭 후보
              </div>
              <MatchCandidates candidates={candidates} clients={clientOptions} />
            </div>
          )}
          {candidates && candidates.length === 0 && seg.ext_status && (
            <div className="text-xs text-slate-400 py-2">
              매칭 후보가 없습니다. “거래처 매칭”을 눌러 생성하세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 이 방을 거래처로 지정/등록 — 지식베이스 귀속 근거(⑦)
function AssignClient({
  conversationId,
  analysis,
  clientOptions,
}: {
  conversationId: string;
  analysis: ArchiveAnalysis;
  clientOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ArchiveActionResult | null>(null);
  const [sel, setSel] = useState("");

  function assign(clientId: string) {
    if (!clientId) return;
    startTransition(async () => {
      const r = await assignArchiveClientAction(conversationId, clientId);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }
  function createNew() {
    startTransition(async () => {
      const r = await createClientFromArchiveAction(conversationId);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  if (analysis.client_id) {
    return (
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-sm">
        <span className="text-slate-400">지정 거래처</span>
        <span className="font-medium">{analysis.client_name ?? "(지정됨)"}</span>
        <Link
          href={`/clients/${analysis.client_id}`}
          className="ml-auto text-xs text-sky-600 hover:text-sky-800"
        >
          지식베이스 보기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
      <div className="text-xs text-slate-500">
        이 방을 거래처로 지정하면 추출/매칭 결과가 그 거래처 지식베이스로 집계됩니다.
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
        >
          <option value="">기존 거래처 선택…</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => assign(sel)}
          disabled={pending || !sel}
          className="rounded-lg border border-slate-300 text-sm px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          지정
        </button>
        <button
          onClick={createNew}
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-50"
          title={`'${analysis.client_guess ?? ""}'(으)로 신규 거래처 등록`}
        >
          신규 등록 “{analysis.client_guess ?? "거래처"}”
        </button>
        {result && (
          <span className={`text-xs ${result.ok ? "text-emerald-700" : "text-rose-600"}`}>
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ArchiveDetail({
  conversationId,
  archiveStatus,
  analysis,
  segments,
  clientOptions,
}: {
  conversationId: string;
  archiveStatus: string | null;
  analysis: ArchiveAnalysis | null;
  segments: SegmentRow[];
  clientOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ArchiveActionResult | null>(null);

  const meta = STATUS_META[(archiveStatus ?? "archived") as DisplayStatus] ?? STATUS_META.archived;

  function run() {
    startTransition(async () => {
      const r = await runArchivePipelineAction(conversationId);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  const dispatched = segments.filter((s) => s.signals?.dispatch).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">📦 원본 자료실 (대형 채팅방)</span>
          <span className={`text-xs rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
          <button
            onClick={run}
            disabled={pending}
            className="ml-auto rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {pending ? "분석·분리 중…" : segments.length > 0 ? "재분석·재분리" : "분석·분리 실행"}
          </button>
        </div>
        <p className="mt-2 text-xs text-indigo-700/80">
          원본은 그대로 보존됩니다. 자동 분석(거래처·기간·참여자)과 상담 단위 분리는 파생물로 별도 저장되며,
          비용이 드는 AI 추출은 다음 단계에서 상담 단위별로 실행합니다.
        </p>
        {result && (
          <p className={`mt-1 text-xs ${result.ok ? "text-emerald-700" : "text-rose-600"}`}>
            {result.message}
          </p>
        )}
      </div>

      {/* ① 자동 분석 요약 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold mb-2">자동 분석</div>
        {!analysis ? (
          <p className="text-sm text-slate-400">아직 분석 전입니다. “분석·분리 실행”을 눌러주세요.</p>
        ) : (
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="text-slate-400 w-20 shrink-0">거래처추정</dt>
              <dd>
                {analysis.client_guess ?? "—"}
                {analysis.client_name && (
                  <span className="ml-1 text-xs text-emerald-700">→ {analysis.client_name} 매칭</span>
                )}
                {analysis.client_score != null && !analysis.client_name && (
                  <span className="ml-1 text-xs text-slate-400">
                    (유사 {Math.round(analysis.client_score * 100)}%)
                  </span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400 w-20 shrink-0">기간</dt>
              <dd>
                {ymd(analysis.period_start)} ~ {ymd(analysis.period_end)}
                <span className="text-slate-400"> · {analysis.active_days ?? 0}일 활동</span>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400 w-20 shrink-0">메시지</dt>
              <dd>{(analysis.message_total ?? 0).toLocaleString()}건</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400 w-20 shrink-0">참여자</dt>
              <dd className="min-w-0">
                {analysis.participants.slice(0, 6).map((p, i) => (
                  <span key={i} className="inline-block mr-2 text-xs">
                    <span className={p.type === "staff" ? "text-slate-500" : "text-slate-800 font-medium"}>
                      {p.name ?? "(이름없음)"}
                    </span>
                    <span className="text-slate-400"> {p.count}</span>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        )}
        {analysis && (
          <AssignClient
            conversationId={conversationId}
            analysis={analysis}
            clientOptions={clientOptions}
          />
        )}
      </div>

      {/* ⑤ 상담 단위 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold flex items-center gap-2">
          상담 단위
          <span className="text-slate-400 font-normal">({segments.length.toLocaleString()}건)</span>
          {segments.length > 0 && (
            <span className="ml-auto text-xs text-slate-400">배차완료 {dispatched.toLocaleString()}건</span>
          )}
        </div>
        {segments.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">
            아직 분리 전입니다. “분석·분리 실행”을 누르면 접수/배차/시간공백/거래처 기준으로 상담 단위가 나뉩니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {segments.map((s) => (
              <SegmentItem
                key={s.id}
                conversationId={conversationId}
                seg={s}
                clientOptions={clientOptions}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
