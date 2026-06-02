"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "대시보드", icon: "📊" },
  { href: "/conversations", label: "상담관리", icon: "💬" },
  { href: "/faqs", label: "FAQ 관리", icon: "📚" },
  { href: "/clients", label: "거래처", icon: "🏢" },
  { href: "/search", label: "상담검색", icon: "🔍" },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

function navTitle(pathname: string): string {
  const hit = NAV.find(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/"),
  );
  return hit?.label ?? "NONSTOP-AI";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-lg font-bold text-white">NONSTOP-AI</div>
        <div className="text-xs text-slate-400 mt-0.5">논사원 AI · 상담비서</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((n) => {
          const active =
            pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-500">
        목업 모드 · v0.1
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex w-60 shrink-0 bg-slate-900 fixed inset-y-0 left-0">
        {SidebarContent}
      </aside>

      {/* 모바일 드로어 */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* 본문 영역 */}
      <div className="flex-1 md:ml-60 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 backdrop-blur px-4 h-14">
          <button
            className="md:hidden text-2xl leading-none"
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
          >
            ☰
          </button>
          <h1 className="text-base font-semibold">{navTitle(pathname)}</h1>
          <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline">오현미님</span>
            <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-medium">
              배차팀
            </span>
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
