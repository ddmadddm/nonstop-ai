// 인증 DAL(Data Access Layer) — 세션 → 직원(agents) 매핑을 한 곳에서 처리.
//   · getCurrentUser(): 로그인 사용자 + 연결된 직원. 미인증/미설정이면 null.
//   · requireAgent(): 유효한 직원이 아니면 /login 으로 redirect.
//   · requireRoles(): 역할 부족 시 /dashboard 로 redirect.
//   최초 로그인 시 이메일로 agents 를 찾아 auth_uid 를 연동한다.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { sql } from "@/lib/db/client";

export interface SessionAgent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  email: string | null;
  is_active: boolean;
  is_system: boolean;
}

export interface CurrentUser {
  authUid: string;
  email: string | null;
  agent: SessionAgent | null; // 연결된 직원(없으면 미등록 사용자)
}

// auth_uid 또는 이메일로 직원을 찾고, 미연동이면 auth_uid 를 연결한다.
async function linkAgent(authUid: string, email: string | null): Promise<SessionAgent | null> {
  const cols = sql`id, name, role, department, email, is_active, is_system`;

  const [byUid] = await sql<SessionAgent[]>`
    select ${cols} from agents where auth_uid = ${authUid} limit 1`;
  if (byUid) return byUid;

  if (email) {
    const [byEmail] = await sql<SessionAgent[]>`
      select ${cols} from agents where lower(email) = ${email.toLowerCase()} limit 1`;
    if (byEmail) {
      // 최초 로그인 — auth_uid 연동(변경이력은 트리거가 기록).
      await sql`
        update agents set auth_uid = ${authUid}, updated_by = ${byEmail.id}
        where id = ${byEmail.id} and auth_uid is null`;
      return byEmail;
    }
  }
  return null;
}

// 로그인 보류(Supabase 미설정) 시: 인증 없이 앱을 쓸 수 있도록 대표/관리자 1명으로 동작.
//   키가 채워지면 이 분기는 타지 않고 실제 세션 사용자로 전환된다.
async function devFallbackUser(): Promise<CurrentUser | null> {
  const [a] = await sql<SessionAgent[]>`
    select id, name, role, department, email, is_active, is_system from agents
    where is_active and not is_system and role in ('owner','admin')
    order by case role when 'owner' then 0 else 1 end, created_at
    limit 1`;
  return a ? { authUid: "dev", email: a.email, agent: a } : null;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return devFallbackUser();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const agent = await linkAgent(user.id, user.email ?? null);
  return { authUid: user.id, email: user.email ?? null, agent };
});

// 현재 로그인 직원 이름 — 서버 액션/페이지의 등록자·검수자(created_by/updated_by) 기본값.
//   미인증/미상이면 null(호출부에서 적절히 처리). 로그인 보류(dev) 시 대표/관리자 이름.
export async function getActorName(): Promise<string | null> {
  const u = await getCurrentUser();
  return u?.agent?.name ?? null;
}

// 유효한 직원만 통과. 시스템 계정/비활성/미등록은 차단(로그인 화면으로).
export async function requireAgent(): Promise<CurrentUser & { agent: SessionAgent }> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!u.agent) redirect("/login?error=not-staff");
  if (u.agent.is_system || u.agent.role === "system") redirect("/login?error=system");
  if (!u.agent.is_active) redirect("/login?error=inactive");
  return u as CurrentUser & { agent: SessionAgent };
}

export async function requireRoles(
  roles: readonly string[],
): Promise<CurrentUser & { agent: SessionAgent }> {
  const u = await requireAgent();
  if (!roles.includes(u.agent.role)) redirect("/dashboard?error=forbidden");
  return u;
}
