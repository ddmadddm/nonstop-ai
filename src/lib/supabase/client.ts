// 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트 — 비밀번호 변경 등에 사용.
"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
