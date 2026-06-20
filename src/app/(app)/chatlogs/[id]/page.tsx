import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db/client";
import {
  getExtraction,
  getTranscript,
  getExtractionHistory,
  getExtractionLogs,
} from "@/lib/db/extractions";
import { formatDateTime } from "@/lib/utils";
import ExtractionPanel from "./ExtractionPanel";

export const dynamic = "force-dynamic";

async function getConversation(id: string) {
  const [c] = await sql<
    { id: string; title: string | null; message_count: number }[]
  >`select id, title, message_count from conversations
    where id = ${id} and source_system in ('chatlog','material')`;
  return c ?? null;
}

export default async function ChatlogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) notFound();

  const [{ messages }, extraction] = await Promise.all([
    getTranscript(id),
    getExtraction(id),
  ]);
  const history = extraction ? await getExtractionHistory(extraction.id) : [];
  const logs = await getExtractionLogs(id);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex items-center gap-2">
        <Link href="/chatlogs" className="text-sm text-slate-500 hover:text-slate-900">
          ← 상담자료
        </Link>
        <h1 className="text-base font-semibold truncate">{conv.title ?? "대화"}</h1>
        <span className="text-xs text-slate-400">메시지 {conv.message_count}건</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 좌: 원본 대화 (parsed_messages, 읽기 전용) */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">
            원본 대화 <span className="text-slate-400 font-normal">(수정 불가)</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-3 space-y-2">
            {messages.map((m, i) => {
              const staff = m.sender_type === "staff";
              return (
                <div key={i} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      staff
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <div className="text-[11px] opacity-70 mb-0.5">
                      {staff ? "직원" : "고객"}
                      {m.sender_name ? ` · ${m.sender_name}` : ""}
                      {m.sent_at ? ` · ${formatDateTime(m.sent_at)}` : ""}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 우: AI 추출 결과 + 직원 수정 */}
        <section className="space-y-4">
          <ExtractionPanel conversationId={id} extraction={extraction} />

          {/* 변경 이력 */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">
              변경 이력 <span className="text-slate-400 font-normal">({history.length})</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {history.length === 0 && (
                <div className="p-4 text-sm text-slate-400">아직 이력이 없습니다.</div>
              )}
              {history.map((h, i) => (
                <div key={i} className="px-4 py-2 text-xs">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 mr-2 ${
                      h.action === "INSERT"
                        ? "bg-emerald-100 text-emerald-700"
                        : h.action === "DEACTIVATE"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {h.action}
                  </span>
                  <span className="text-slate-500">
                    {h.changed_by_name ?? "시스템"} · {formatDateTime(h.changed_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 추출 로그 */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">
              추출 로그 <span className="text-slate-400 font-normal">({logs.length})</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {logs.length === 0 && (
                <div className="p-4 text-sm text-slate-400">추출 시도 기록이 없습니다.</div>
              )}
              {logs.map((g, i) => (
                <div key={i} className="px-4 py-2 text-xs flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 ${
                      g.status === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {g.status === "success" ? "성공" : "추출대기"}
                  </span>
                  {g.status === "success" && g.avg_confidence != null && (
                    <span className="text-slate-500">
                      평균 신뢰도 {Math.round(g.avg_confidence * 100)}%
                    </span>
                  )}
                  {g.duration_ms != null && (
                    <span className="text-slate-400">{g.duration_ms}ms</span>
                  )}
                  {g.error && <span className="text-rose-600 truncate">{g.error}</span>}
                  <span className="text-slate-400 ml-auto">
                    {g.created_by_name ? `${g.created_by_name} · ` : ""}
                    {formatDateTime(g.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
