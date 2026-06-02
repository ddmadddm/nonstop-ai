import Link from "next/link";
import { notFound } from "next/navigation";
import AiDraftPanel from "@/components/AiDraftPanel";
import { CategoryBadge, StatusBadge } from "@/components/badges";
import { DispatchCard, OrderCard } from "@/components/OrderCard";
import { getClient, getConversation, getFaqsByIds } from "@/lib/data";
import type { Message } from "@/lib/types";
import { cx, formatTime } from "@/lib/utils";

function Bubble({ m }: { m: Message }) {
  const isCustomer = m.sender === "customer";
  return (
    <div className={cx("flex flex-col", isCustomer ? "items-start" : "items-end")}>
      {!isCustomer && m.agentName && (
        <span className="text-[11px] text-slate-400 mb-0.5 mr-1">
          {m.agentName}
        </span>
      )}
      <div className={cx("flex items-end gap-1.5 max-w-[85%]", isCustomer ? "" : "flex-row-reverse")}>
        <div
          className={cx(
            "rounded-2xl px-3 py-2 text-sm preline",
            isCustomer
              ? "bg-white border border-slate-200 rounded-tl-sm"
              : "bg-yellow-300 text-slate-900 rounded-tr-sm",
          )}
        >
          {m.attachments?.map((a, i) => (
            <div
              key={i}
              className="mb-1 inline-flex items-center gap-1 rounded bg-black/5 px-2 py-1 text-xs text-slate-600"
            >
              🗺️ {a.label ?? "첨부"}
            </div>
          ))}
          {m.text && <div>{m.text}</div>}
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">
          {formatTime(m.sentAt)}
        </span>
      </div>
    </div>
  );
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cv = await getConversation(id);
  if (!cv) notFound();

  const [client, draftFaqs] = await Promise.all([
    getClient(cv.clientId),
    cv.aiDraft ? getFaqsByIds(cv.aiDraft.usedFaqIds) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* 헤더 */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/conversations" className="text-slate-400 hover:text-slate-900">
            ←
          </Link>
          <span className="font-semibold">{cv.title}</span>
          {client && (
            <Link
              href={`/clients/${client.id}`}
              className="text-xs text-slate-500 underline hover:text-slate-900"
            >
              {client.name}
            </Link>
          )}
          <CategoryBadge categoryKey={cv.categoryKey} />
          <StatusBadge status={cv.status} />
          {cv.assignedAgent && (
            <span className="ml-auto text-xs text-slate-400">
              담당 {cv.assignedAgent}
            </span>
          )}
        </div>
      </div>

      {/* 본문: 스레드 + 컨텍스트 */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_22rem] overflow-hidden">
        {/* 메시지 스레드 */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-3 bg-slate-100">
          {cv.messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
        </div>

        {/* 컨텍스트 패널 */}
        <aside className="overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 p-4 space-y-4">
          {cv.order && <OrderCard order={cv.order} />}
          {cv.dispatch && <DispatchCard dispatch={cv.dispatch} />}
          {cv.aiDraft && (
            <AiDraftPanel
              initialText={cv.aiDraft.text}
              confidence={cv.aiDraft.confidence}
              faqs={draftFaqs.map((f) => ({ id: f.id, question: f.question }))}
            />
          )}
          {!cv.aiDraft && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
              이 상담에는 AI 초안이 아직 없습니다.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
