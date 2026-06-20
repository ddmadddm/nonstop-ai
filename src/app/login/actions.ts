"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { sql } from "@/lib/db/client";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  // 오픈 리다이렉트 방지: 내부 절대경로만 허용.
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

// 로그인 — 이메일/비밀번호. 성공 후 유효한 직원(staff, 시스템 아님, 활성)인지 확인.
export async function loginAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    return { error: "로그인이 아직 설정되지 않았습니다(관리자: .env 의 Supabase 키 필요)." };
  }
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력하세요." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // 직원 자격 확인 — 등록/활성/비시스템만 통과. 아니면 즉시 로그아웃.
  const [agent] = await sql<{ role: string; is_active: boolean; is_system: boolean }[]>`
    select role, is_active, is_system from agents
    where auth_uid = ${data.user.id} or lower(email) = ${email.toLowerCase()}
    limit 1`;
  if (!agent) {
    await supabase.auth.signOut();
    return { error: "등록된 직원 계정이 아닙니다. 관리자에게 문의하세요." };
  }
  if (agent.is_system || agent.role === "system") {
    await supabase.auth.signOut();
    return { error: "시스템 계정은 로그인할 수 없습니다." };
  }
  if (!agent.is_active) {
    await supabase.auth.signOut();
    return { error: "비활성화된 계정입니다. 관리자에게 문의하세요." };
  }

  redirect(safeNext(formData.get("next")));
}

// 비밀번호 재설정 메일 발송 — 메일 링크 → /auth/callback → /auth/reset 에서 새 비밀번호 설정.
export async function requestPasswordResetAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    return { error: "비밀번호 재설정이 아직 설정되지 않았습니다(.env Supabase 키 필요)." };
  }
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "이메일을 입력하세요." };

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const redirectTo = `${proto}://${host}/auth/callback?next=/auth/reset`;

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  // 계정 존재 여부를 노출하지 않도록 항상 동일 안내.
  return { notice: "재설정 메일을 보냈습니다. 메일의 링크로 새 비밀번호를 설정하세요." };
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
