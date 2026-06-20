import Link from "next/link";
import { listRecentDrafts } from "@/lib/db/assistant";
import { formatDateTime } from "@/lib/utils";
import AnswerForm from "./AnswerForm";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const drafts = await listRecentDrafts(10);

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

      {drafts.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold">최근 생성한 답변</span>
          </div>
          <ul className="divide-y divide-slate-50">
            {drafts.map((d) => (
              <li key={d.id} className="px-4 py-2.5">
                <div className="text-sm font-medium truncate">{d.question}</div>
                {d.answer_draft && (
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {d.answer_draft}
                  </div>
                )}
                <div className="text-[11px] text-slate-400 mt-1">
                  {d.created_by_name ?? "—"} · {formatDateTime(d.created_at)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-400">
        근거가 된 과거 상담은 <Link href="/chatlogs" className="underline">상담자료 업로드</Link> ·{" "}
        <Link href="/conversations" className="underline">상담관리</Link> 에서 확인할 수 있습니다.
      </p>
    </div>
  );
}
