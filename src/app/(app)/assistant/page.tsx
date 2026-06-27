import Link from "next/link";
import { searchDrafts, type DraftFilters as DF } from "@/lib/db/assistant";
import { formatDateTime } from "@/lib/utils";
import AnswerForm from "./AnswerForm";
import DraftFilters from "./DraftFilters";
import Pagination from "@/components/Pagination";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 10;

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
const STATUS_LABEL: Record<string, string> = { draft: "초안", edited: "수정됨", sent: "발송" };

const FILTER_KEYS = ["dateStart", "dateEnd", "mode", "clientName", "keyword"] as const;
type SP = Record<string, string | undefined>;

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filters: DF = {
    dateStart: sp.dateStart,
    dateEnd: sp.dateEnd,
    mode: sp.mode,
    clientName: sp.clientName,
    keyword: sp.keyword,
  };
  const { items, total } = await searchDrafts(filters, page, PAGE_SIZE);

  const hrefFor = (p: number) => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) if (sp[k]) q.set(k, sp[k]!);
    q.set("page", String(p));
    return `/assistant?${q.toString()}#recent`;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div>
        <p className="text-sm text-slate-500">
          상담 문의(질문)를 넣으면 <b>논사원</b>이 업로드된 과거 상담 기록(메시지·음성·이미지 변환본)에서
          근거를 찾아 ① 고객에게 보낼 <b>1차 답변문 초안</b>과 ② 질문에서 파악한 <b>배차 항목</b>을 만들어
          줍니다.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          ※ 답변은 <b>초안</b>입니다. 운임·도착시간 등 확정 정보는 근거가 없으면 비워두므로, 상담원이
          검토·보완 후 전송하세요. 자료를 많이 올릴수록 답변 근거가 풍부해집니다.
        </p>
      </div>

      <AnswerForm />

      {/* 최근 생성한 답변 — 검색/필터/페이지네이션 */}
      <section id="recent" className="space-y-3 scroll-mt-16">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">최근 생성한 답변</span>
          <span className="text-xs text-slate-400">
            Total <b className="text-slate-700 tabular-nums">{total.toLocaleString()}</b>건 · 최신순 · {PAGE_SIZE}개씩
          </span>
        </div>

        <DraftFilters />

        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-50">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              조건에 맞는 답변이 없습니다.
            </div>
          ) : (
            items.map((d) => (
              <Link
                key={d.id}
                href={`/assistant/${d.id}`}
                className="block px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {d.client_mode && (
                    <span className={`rounded-full px-2 py-0.5 ${MODE_CLS[d.client_mode] ?? "bg-slate-100 text-slate-600"}`}>
                      {MODE_LABEL[d.client_mode] ?? d.client_mode}
                    </span>
                  )}
                  {d.client_name && <span className="text-slate-600 font-medium">{d.client_name}</span>}
                  {d.manager_name && <span className="text-slate-400">{d.manager_name}</span>}
                  {d.recognition_confidence != null && (
                    <span className="text-slate-400">신뢰도 {Math.round(d.recognition_confidence * 100)}%</span>
                  )}
                  <span className="ml-auto inline-flex items-center gap-2 text-slate-400">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{STATUS_LABEL[d.status] ?? d.status}</span>
                    {formatDateTime(d.created_at)}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium truncate">{d.question}</div>
                {(d.answer_final ?? d.answer_draft) && (
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {d.answer_final ?? d.answer_draft}
                  </div>
                )}
              </Link>
            ))
          )}
        </div>

        <div className="flex justify-center">
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} hrefFor={hrefFor} />
        </div>
      </section>

      <p className="text-xs text-slate-400">
        근거가 된 과거 상담은 <Link href="/chatlogs" className="underline">상담자료 업로드</Link> ·{" "}
        <Link href="/conversations" className="underline">상담관리</Link> 에서 확인할 수 있습니다.
      </p>
    </div>
  );
}
