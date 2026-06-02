import Link from "next/link";
import { CategoryBadge } from "@/components/badges";
import { search } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const hits = q ? await search(q) : [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <form action="/search" method="get">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="상담 내용·주소·기사명·물품 등으로 검색 (예: 대전, 다마스, 재배차)"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4">
            검색
          </button>
        </div>
      </form>

      {q && (
        <div className="text-sm text-slate-500">
          &quot;{q}&quot; 검색 결과 {hits.length}건
        </div>
      )}

      <div className="space-y-2">
        {hits.map((h, i) => (
          <Link
            key={i}
            href={`/conversations/${h.conversationId}`}
            className="block rounded-xl border border-slate-200 bg-white p-3.5 hover:border-slate-400"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{h.title}</span>
              <CategoryBadge categoryKey={h.categoryKey} />
              <span className="ml-auto text-xs text-slate-400">
                {formatDateTime(h.sentAt)}
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-600">{h.snippet}</div>
          </Link>
        ))}
        {q && hits.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            검색 결과가 없습니다.
          </div>
        )}
      </div>

      {!q && (
        <p className="text-xs text-slate-400">
          ※ 목업 모드는 키워드(부분일치) 검색입니다. 실제 환경에서는 의미(벡터)
          검색을 결합한 하이브리드 검색으로 동작합니다. (docs/05 참고)
        </p>
      )}
    </div>
  );
}
