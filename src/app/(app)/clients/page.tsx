import Link from "next/link";
import { getClients, getClientConversations } from "@/lib/data";

export default async function ClientsPage() {
  const clients = await getClients();
  const withCounts = await Promise.all(
    clients.map(async (c) => ({
      ...c,
      count: (await getClientConversations(c.id)).length,
    })),
  );

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <p className="text-sm text-slate-500">거래처별 상담 이력을 관리합니다.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {withCounts.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{c.name}</span>
              <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
                상담 {c.count}건
              </span>
            </div>
            {c.businessNo && (
              <div className="mt-1 text-xs text-slate-400">{c.businessNo}</div>
            )}
            {c.memo && (
              <div className="mt-2 text-sm text-slate-500">{c.memo}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
