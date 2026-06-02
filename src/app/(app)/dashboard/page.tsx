import Link from "next/link";
import { CategoryBadge, StatusBadge } from "@/components/badges";
import { getConversations, getStats } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

const GOALS = [
  { n: "1차", label: "상담 데이터 수집", active: true },
  { n: "2차", label: "FAQ 자동생성", active: false },
  { n: "3차", label: "AI 답변초안", active: false },
  { n: "4차", label: "접수 자동화", active: false },
  { n: "5차", label: "배차 추천", active: false },
];

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const [stats, recent] = await Promise.all([
    getStats(),
    getConversations(),
  ]);
  const maxCat = Math.max(1, ...stats.byCategory.map((c) => c.count));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* 단계 목표 로드맵 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold mb-3">구축 단계</div>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <div
              key={g.n}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                g.active
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <span className="font-bold">{g.n}</span>
              <span>{g.label}</span>
              {g.active && (
                <span className="rounded-full bg-emerald-400 text-emerald-950 text-[10px] font-bold px-1.5 py-0.5">
                  진행
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="오늘 상담" value={stats.todayCount} tone="text-slate-900" />
        <StatCard label="진행중" value={stats.openCount} tone="text-blue-600" />
        <StatCard label="대기" value={stats.pendingCount} tone="text-amber-600" />
        <StatCard label="완료" value={stats.closedCount} tone="text-slate-500" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 유형 분포 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold mb-3">상담유형 분포</div>
          <div className="space-y-2">
            {stats.byCategory.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-sm text-slate-600">
                  {c.name}
                </div>
                <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-slate-700 rounded-full"
                    style={{ width: `${(c.count / maxCat) * 100}%` }}
                  />
                </div>
                <div className="w-6 text-right text-sm font-medium">
                  {c.count}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 상담 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">최근 상담</div>
            <Link
              href="/conversations"
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              전체 보기 →
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recent.slice(0, 5).map((cv) => (
              <Link
                key={cv.id}
                href={`/conversations/${cv.id}`}
                className="flex items-center gap-2 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{cv.title}</div>
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
      </div>
    </div>
  );
}
