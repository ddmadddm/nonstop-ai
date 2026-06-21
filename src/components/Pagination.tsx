// 페이지네이션 — 서버 컴포넌트. hrefFor(page)로 현재 검색조건을 유지한 링크를 만든다.
import Link from "next/link";
import { cx } from "@/lib/utils";

export default function Pagination({
  page,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefFor: (p: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  // 현재 페이지 주변 윈도우(최대 5개) + 처음/끝
  const win = 2;
  const start = Math.max(1, page - win);
  const end = Math.min(totalPages, page + win);
  const nums: number[] = [];
  for (let p = start; p <= end; p++) nums.push(p);

  const base =
    "inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-lg border text-sm";
  const linkCls = "border-slate-300 text-slate-600 hover:bg-slate-50";
  const activeCls = "border-slate-900 bg-slate-900 text-white";
  const disabledCls = "border-slate-200 text-slate-300 pointer-events-none";

  return (
    <nav className="flex items-center gap-1 flex-wrap">
      <Link href={hrefFor(1)} className={cx(base, page <= 1 ? disabledCls : linkCls)} aria-label="처음">
        «
      </Link>
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        className={cx(base, page <= 1 ? disabledCls : linkCls)}
        aria-label="이전"
      >
        ‹
      </Link>
      {start > 1 && <span className="px-1 text-slate-400">…</span>}
      {nums.map((p) => (
        <Link key={p} href={hrefFor(p)} className={cx(base, p === page ? activeCls : linkCls)}>
          {p}
        </Link>
      ))}
      {end < totalPages && <span className="px-1 text-slate-400">…</span>}
      <Link
        href={hrefFor(Math.min(totalPages, page + 1))}
        className={cx(base, page >= totalPages ? disabledCls : linkCls)}
        aria-label="다음"
      >
        ›
      </Link>
      <Link
        href={hrefFor(totalPages)}
        className={cx(base, page >= totalPages ? disabledCls : linkCls)}
        aria-label="끝"
      >
        »
      </Link>
    </nav>
  );
}
