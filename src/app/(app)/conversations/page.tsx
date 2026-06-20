import Link from "next/link";
import { CategoryBadge, StatusBadge } from "@/components/badges";
import { TOP_CATEGORIES } from "@/lib/categories";
import { getConversations } from "@/lib/data";
import { STATUS_LABEL } from "@/lib/types";
import { cx, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "전체" },
  { key: "open", label: STATUS_LABEL.open },
  { key: "pending", label: STATUS_LABEL.pending },
  { key: "closed", label: STATUS_LABEL.closed },
];

function lastPreview(text: string): string {
  return text.replace(/\n/g, " ").slice(0, 60);
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const list = await getConversations({
    status: sp.status || undefined,
    categoryTop: sp.cat || undefined,
  });

  const qs = (next: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { status: sp.status ?? "", cat: sp.cat ?? "", ...next };
    if (merged.status) params.set("status", merged.status);
    if (merged.cat) params.set("cat", merged.cat);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/conversations${qs({ status: f.key })}`}
            className={cx(
              "rounded-full px-3 py-1.5 text-sm font-medium border",
              (sp.status ?? "") === f.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* 유형 필터 */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/conversations${qs({ cat: "" })}`}
          className={cx(
            "rounded-full px-2.5 py-1 text-xs border",
            !sp.cat
              ? "bg-slate-700 text-white border-slate-700"
              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
          )}
        >
          전체 유형
        </Link>
        {TOP_CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={`/conversations${qs({ cat: c.key })}`}
            className={cx(
              "rounded-full px-2.5 py-1 text-xs border",
              sp.cat === c.key
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400",
            )}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {/* 목록 */}
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {list.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-400">
            해당 조건의 상담이 없습니다.
          </div>
        )}
        {list.map((cv) => {
          const last = cv.messages[cv.messages.length - 1];
          return (
            <Link
              key={cv.id}
              href={`/conversations/${cv.id}`}
              className="flex items-start gap-3 p-3.5 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{cv.title}</span>
                  {cv.dispatch && (
                    <span className="text-xs text-slate-400">
                      · {cv.dispatch.vehicleType}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 truncate mt-0.5">
                  {last?.sender === "customer" ? "고객" : last?.agentName ?? "상담원"}:{" "}
                  {lastPreview(last?.text ?? "")}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-slate-400">
                  {formatDateTime(cv.lastMessageAt)}
                </span>
                <div className="flex gap-1">
                  <CategoryBadge categoryKey={cv.categoryKey} />
                  <StatusBadge status={cv.status} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
