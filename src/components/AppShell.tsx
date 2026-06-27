"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/staff";
import { canManageStaff } from "@/lib/permissions";
import { logoutAction } from "@/app/login/actions";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean; // owner/admin 전용(직원관리 등). 세부 메뉴 권한은 추후 확장.
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: "📊" },
  { href: "/assistant", label: "논사원 답변", icon: "🤖" },
  { href: "/conversations", label: "상담관리", icon: "💬" },
  { href: "/chatlogs", label: "상담자료 업로드", icon: "🗂️" },
  { href: "/faqs", label: "FAQ 관리", icon: "📚" },
  { href: "/clients", label: "거래처 관리", icon: "🏢" },
  { href: "/prospects", label: "거래처 후보", icon: "🪪" },
  { href: "/search", label: "상담검색", icon: "🔍" },
  { href: "/staff", label: "직원관리", icon: "👥", adminOnly: true },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

export interface ShellUser {
  name: string;
  role: string;
  department: string | null;
}

function navTitle(pathname: string): string {
  const hit = NAV.find(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/"),
  );
  return hit?.label ?? "NONSTOP-AI";
}

export default function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellUser;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = NAV.filter((n) => !n.adminOnly || canManageStaff(user.role));

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-lg font-bold text-white">NONSTOP-AI</div>
        <div className="text-xs text-slate-400 mt-0.5">논사원 AI · 상담비서</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((n) => {
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
      <div className="px-3 py-4 border-t border-slate-800">
        <div className="px-2 mb-2">
          <div className="text-sm font-medium text-white truncate">{user.name}</div>
          <div className="text-xs text-slate-400">
            {ROLE_LABEL[user.role] ?? user.role}
            {user.department ? ` · ${user.department}` : ""}
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white text-left"
          >
            ↩ 로그아웃
          </button>
        </form>
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
            <span className="hidden sm:inline">{user.name}님</span>
            <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-medium">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
