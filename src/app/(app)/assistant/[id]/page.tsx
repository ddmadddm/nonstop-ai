import Link from "next/link";
import { notFound } from "next/navigation";
import { getDraftDetail } from "@/lib/db/assistant";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  general: "일반 문의",
  key_client: "주거래처",
  new_candidate: "신규 거래처 후보",
};
const MODE_CLS: Record<string, string> = {
  general: "bg-slate-100 text-slate-600",
  key_client: "bg-emerald-100 text-emerald-700",
  new_candidate: "bg-amber-100 text-amber-700",
};

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await getDraftDetail(id);
  if (!d) notFound();

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link href="/assistant" className="text-sm text-slate-500 hover:text-slate-900">
          ← 답변 목록
        </Link>
        <h1 className="text-base font-semibold">답변 상세</h1>
        <span className="ml-auto text-xs text-slate-400">
          {d.created_by_name ?? "—"} · {formatDateTime(d.created_at)}
        </span>
      </div>

      {/* 거래처 인식 결과 */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">거래처 인식 결과</span>
          {d.client_mode && (
            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${MODE_CLS[d.client_mode] ?? ""}`}>
              {MODE_LABEL[d.client_mode] ?? d.client_mode}
            </span>
          )}
          {d.requested_mode === "auto" && (
            <span className="text-[11px] text-slate-500">자동판단</span>
          )}
          <span className="ml-auto text-xs text-slate-500">
            신뢰도{" "}
            {d.recognition_confidence != null
              ? `${Math.round(d.recognition_confidence * 100)}%`
              : "—"}
          </span>
        </div>
        <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <span className="text-slate-400 w-16 shrink-0">매칭 거래처</span>
            <span>
              {d.recognized_client_id ? (
                <Link
                  href={`/clients/${d.recognized_client_id}`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  {d.recognized_client_name ?? d.client_name}
                </Link>
              ) : (
                <span className="text-slate-400">없음(미등록)</span>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-slate-400 w-16 shrink-0">담당자/연락처</span>
            <span className="text-slate-600">
              {[d.manager_name, d.phone].filter(Boolean).join(" · ") || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* 원문 질문 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">원문 질문</div>
        <p className="p-4 text-sm whitespace-pre-wrap leading-relaxed">{d.question}</p>
      </div>

      {/* 생성 답변 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">
          생성 답변 (초안)
          {d.ai_model && <span className="ml-2 text-[11px] text-slate-400">{d.ai_model}</span>}
        </div>
        <p className="p-4 text-sm whitespace-pre-wrap leading-relaxed">{d.answer_draft ?? "—"}</p>
      </div>

      {/* 참고 근거 */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">
          참고한 근거{" "}
          <span className="text-slate-400 font-normal">({d.used_sources.length})</span>
        </div>
        {d.used_sources.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">참고한 과거 상담 출처가 없습니다.</p>
        ) : (
          <ul className="p-2">
            {d.used_sources.map((s, i) => (
              <li key={i} className="px-2 py-1.5 text-sm">
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
    </div>
  );
}
