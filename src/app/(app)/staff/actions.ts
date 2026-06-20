"use server";

import { revalidatePath } from "next/cache";
import {
  createAgent,
  updateAgent,
  deactivateAgent,
  changeRole,
  emailExists,
  getAgentHistory,
  getAgent,
  DEPARTMENTS,
  ROLES,
  type AgentInput,
  type AgentHistory,
} from "@/lib/db/agents";
import { randomUUID } from "node:crypto";
import { requireAgent } from "@/lib/auth";
import { canManageStaff } from "@/lib/permissions";
import { sql } from "@/lib/db/client";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const DEPT_SET = new Set<string>(DEPARTMENTS);
const ROLE_SET = new Set<string>(ROLES);

// 관리자(owner/admin) 확인 + 감사 귀속용 액터 이름. 권한 없으면 메시지 반환.
async function adminActor(): Promise<{ ok: true; name: string } | { ok: false; message: string }> {
  const { agent } = await requireAgent();
  if (!canManageStaff(agent.role)) {
    return { ok: false, message: "권한이 없습니다(owner/admin 전용)." };
  }
  return { ok: true, name: agent.name };
}

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

// 폼 → AgentInput 파싱 + 검증(부서/권한은 허용값만, 시스템 권한은 화면에서 지정 불가).
function parseInput(fd: FormData): AgentInput {
  const name = str(fd, "name");
  if (!name) throw new Error("이름은 필수입니다.");

  const department = str(fd, "department");
  if (department && !DEPT_SET.has(department)) throw new Error("부서 값이 올바르지 않습니다.");

  const role = str(fd, "role") ?? "staff";
  if (!ROLE_SET.has(role)) throw new Error("권한 값이 올바르지 않습니다.");

  return {
    name,
    position: str(fd, "position"),
    department,
    role,
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    memo: str(fd, "memo"),
    is_active: fd.get("is_active") !== "false", // 기본 활성
  };
}

export async function createAgentAction(fd: FormData): Promise<ActionResult> {
  try {
    const g = await adminActor();
    if (!g.ok) return g;
    const input = parseInput(fd);
    if (input.email && (await emailExists(input.email))) {
      return { ok: false, message: `이미 등록된 이메일입니다: ${input.email}` };
    }
    await createAgent(input, g.name);
    revalidatePath("/staff");
    return { ok: true, message: `${input.name} 직원을 추가했습니다.` };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}

export async function updateAgentAction(id: string, fd: FormData): Promise<ActionResult> {
  try {
    const g = await adminActor();
    if (!g.ok) return g;
    const input = parseInput(fd);
    if (input.email && (await emailExists(input.email, id))) {
      return { ok: false, message: `이미 등록된 이메일입니다: ${input.email}` };
    }
    await updateAgent(id, input, g.name);
    revalidatePath("/staff");
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateAgentAction(id: string): Promise<ActionResult> {
  try {
    const g = await adminActor();
    if (!g.ok) return g;
    await deactivateAgent(id, g.name);
    revalidatePath("/staff");
    return { ok: true, message: "비활성화했습니다." };
  } catch (e) {
    return { ok: false, message: `비활성화 실패: ${(e as Error).message}` };
  }
}

export async function changeRoleAction(id: string, role: string): Promise<ActionResult> {
  try {
    const g = await adminActor();
    if (!g.ok) return g;
    if (!ROLE_SET.has(role)) throw new Error("권한 값이 올바르지 않습니다.");
    await changeRole(id, role, g.name);
    revalidatePath("/staff");
    return { ok: true, message: "권한을 변경했습니다." };
  } catch (e) {
    return { ok: false, message: `권한 변경 실패: ${(e as Error).message}` };
  }
}

// 직원에게 로그인 계정(Supabase Auth) 생성 + auth_uid 연동.
//   임시 비밀번호를 생성해 1회 반환(관리자가 직원에게 전달 → 직원이 비번 재설정).
//   서비스 롤 키 필요. 시스템/이메일 없음/이미 연동된 계정은 거부.
export async function createAuthAccountAction(id: string): Promise<ActionResult> {
  try {
    const g = await adminActor();
    if (!g.ok) return g;
    if (!isAdminConfigured()) {
      return { ok: false, message: "로그인 계정 생성이 설정되지 않았습니다(.env SUPABASE_SERVICE_ROLE_KEY 필요)." };
    }
    const agent = await getAgent(id);
    if (!agent) return { ok: false, message: "직원을 찾을 수 없습니다." };
    if (agent.is_system) return { ok: false, message: "시스템 계정은 로그인 계정을 만들 수 없습니다." };
    if (!agent.email) return { ok: false, message: "이메일이 없는 직원은 로그인 계정을 만들 수 없습니다." };

    const admin = createSupabaseAdminClient();
    const tempPassword = `Ns!${randomUUID().slice(0, 10)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: agent.email,
      password: tempPassword,
      email_confirm: true,
    });
    if (error || !data.user) {
      return { ok: false, message: `계정 생성 실패: ${error?.message ?? "알 수 없는 오류"}` };
    }
    await sql`update agents set auth_uid = ${data.user.id}, updated_by = ${id} where id = ${id}`;
    revalidatePath("/staff");
    return {
      ok: true,
      message: `로그인 계정을 만들었습니다. 임시 비밀번호: ${tempPassword} (직원에게 전달 후 재설정 안내)`,
    };
  } catch (e) {
    return { ok: false, message: `계정 생성 실패: ${(e as Error).message}` };
  }
}

// 이메일 실시간 중복 체크(폼 blur). true=중복.
export async function checkEmailAction(email: string, exceptId?: string): Promise<boolean> {
  await requireAgent();
  const e = email.trim();
  if (!e) return false;
  return emailExists(e, exceptId);
}

export async function getAgentHistoryAction(id: string): Promise<AgentHistory[]> {
  const g = await adminActor();
  if (!g.ok) return [];
  return getAgentHistory(id);
}
