import Link from "next/link";
import { listProspects } from "@/lib/db/prospects";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProspectsPage() {
  const prospects = await listProspects("new");

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <p className="text-sm text-slate-500">
        논사원 답변에서 수집된 <b>신규 거래처 후보</b>입니다. 검토 후 기존 거래처에 연결하거나 신규
        거래처로 등록하세요.
      </p>

      {prospects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          검토할 신규 거래처 후보가 없습니다.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {prospects.map((p) => (
            <Link
              key={p.id}
              href={`/prospects/${p.id}`}
              className="block p-4 hover:bg-slate-50"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{p.name ?? "(거래처명 미상)"}</span>
                {p.manager_name && (
                  <span className="text-sm text-slate-500">/ {p.manager_name}</span>
                )}
                {p.phone && <span className="text-xs text-slate-400">{p.phone}</span>}
                <span className="ml-auto text-xs text-slate-400">
                  {formatDateTime(p.created_at)}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {[p.origin, p.destination].filter(Boolean).join(" → ") || "경로 정보 없음"}
              </div>
              {p.question && (
                <div className="mt-1.5 text-sm text-slate-500 line-clamp-1">{p.question}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
