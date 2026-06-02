import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBadge, StatusBadge } from "@/components/badges";
import { getClient, getClientConversations } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const convs = await getClientConversations(id);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Link href="/clients" className="text-slate-400 hover:text-slate-900">
            ←
          </Link>
          <span className="text-lg font-semibold">{client.name}</span>
          <span className="ml-auto text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
            상담 {convs.length}건
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
          {client.businessNo && (
            <>
              <dt className="text-slate-400">사업자</dt>
              <dd>{client.businessNo}</dd>
            </>
          )}
          {client.phone && (
            <>
              <dt className="text-slate-400">연락처</dt>
              <dd>{client.phone}</dd>
            </>
          )}
          {client.memo && (
            <>
              <dt className="text-slate-400">메모</dt>
              <dd>{client.memo}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        <div className="px-4 py-2.5 text-sm font-semibold">상담 이력</div>
        {convs.map((cv) => (
          <Link
            key={cv.id}
            href={`/conversations/${cv.id}`}
            className="flex items-center gap-2 p-3.5 hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{cv.title}</div>
              <div className="text-xs text-slate-400">
                {formatDateTime(cv.lastMessageAt)}
              </div>
            </div>
            <CategoryBadge categoryKey={cv.categoryKey} />
            <StatusBadge status={cv.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
