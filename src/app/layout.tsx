import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NONSTOP-AI · 논사원 AI",
  description: "논스톱서비스 상담 데이터 기반 AI 상담비서 — 상담관리·FAQ·AI답변·접수/배차",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "논사원 AI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
