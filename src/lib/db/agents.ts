// 직원관리(Admin) 데이터 레이어 — agents 테이블.
//   원칙: 물리삭제 금지(비활성화), 모든 INSERT/UPDATE 는 fn_audit 트리거가
//   audit_logs 에 before/after 자동 기록(변경이력). 이메일은 있으면 유일, 없으면 NULL.
import { sql, resolveAgentId } from "./client";

// 공용 상수는 서버 의존성 없는 모듈에서 단일 정의(클라이언트와 공유). 재노출만 한다.
export { DEPARTMENTS, ROLES, ROLE_LABEL, type Department, type Role } from "@/lib/staff";

export interface Agent {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  memo: string | null;
  is_system: boolean;
  is_active: boolean;
  auth_uid: string | null; // Supabase Auth 연동 여부(있으면 로그인 계정 존재)
  row_version: number;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
}

export interface AgentInput {
  name: string;
  position: string | null;
  department: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  memo: string | null;
  is_active: boolean;
}

const SELECT = sql`
  select id, name, position, department, role, email, phone, memo,
         is_system, is_active, auth_uid, row_version,
         created_at, updated_at, deactivated_at
  from agents`;

function toAgent(r: Record<string, unknown>): Agent {
  return {
    id: r.id as string,
    name: r.name as string,
    position: (r.position as string) ?? null,
    department: (r.department as string) ?? null,
    role: r.role as string,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    memo: (r.memo as string) ?? null,
    is_system: r.is_system as boolean,
    is_active: r.is_active as boolean,
    auth_uid: (r.auth_uid as string) ?? null,
    row_version: r.row_version as number,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
    deactivated_at: r.deactivated_at ? (r.deactivated_at as Date).toISOString() : null,
  };
}

// 전체 직원(활성+비활성, 시스템 포함). 필터/검색은 화면(클라이언트)에서 처리.
export async function listAgents(): Promise<Agent[]> {
  const rows = await sql<Record<string, unknown>[]>`
    ${SELECT} order by is_system asc, is_active desc, department nulls last, name`;
  return rows.map(toAgent);
}

export async function getAgent(id: string): Promise<Agent | null> {
  const rows = await sql<Record<string, unknown>[]>`${SELECT} where id = ${id}`;
  return rows[0] ? toAgent(rows[0]) : null;
}

// 이메일 중복 체크(자기 자신 제외). 값이 없으면 중복 아님(NULL 허용).
export async function emailExists(email: string, exceptId?: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const rows = await sql<{ id: string }[]>`
    select id from agents
    where lower(email) = ${e} ${exceptId ? sql`and id <> ${exceptId}` : sql``}
    limit 1`;
  return rows.length > 0;
}

export async function createAgent(input: AgentInput, byName?: string): Promise<Agent> {
  const by = await resolveAgentId(byName);
  const [row] = await sql<Record<string, unknown>[]>`
    insert into agents (name, position, department, role, email, phone, memo, created_by, updated_by)
    values (${input.name.trim()}, ${input.position}, ${input.department}, ${input.role},
            ${input.email}, ${input.phone}, ${input.memo}, ${by}, ${by})
    returning id, name, position, department, role, email, phone, memo,
              is_system, is_active, auth_uid, row_version, created_at, updated_at, deactivated_at`;
  return toAgent(row);
}

// 직원 정보 수정(+ 활성/비활성 토글). 변경이력은 트리거가 자동 기록.
export async function updateAgent(
  id: string,
  input: AgentInput,
  byName?: string,
): Promise<Agent> {
  const by = await resolveAgentId(byName);
  // is_active=false 로 바뀌면 비활성화 시각/주체 기록, true 면 해제.
  const [row] = await sql<Record<string, unknown>[]>`
    update agents set
      name=${input.name.trim()}, position=${input.position}, department=${input.department},
      role=${input.role}, email=${input.email}, phone=${input.phone}, memo=${input.memo},
      is_active=${input.is_active},
      deactivated_at = ${input.is_active ? sql`null` : sql`now()`},
      deactivated_by = ${input.is_active ? sql`null` : by},
      updated_by=${by}
    where id=${id}
    returning id, name, position, department, role, email, phone, memo,
              is_system, is_active, auth_uid, row_version, created_at, updated_at, deactivated_at`;
  if (!row) throw new Error("직원을 찾을 수 없습니다.");
  return toAgent(row);
}

// 비활성화(삭제 대체). is_active=false + 비활성화 시각/주체. 트리거가 DEACTIVATE 로그 기록.
export async function deactivateAgent(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update agents set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
    where id=${id} and is_active`;
}

// 권한 변경만 단독 수행.
export async function changeRole(id: string, role: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`update agents set role=${role}, updated_by=${by} where id=${id}`;
}

// 변경 이력(audit_logs) — 누가 언제 무엇을 바꿨나.
export interface AgentHistory {
  action: string;
  changed_by_name: string | null;
  changed_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
export async function getAgentHistory(id: string): Promise<AgentHistory[]> {
  const rows = await sql<
    { action: string; changed_by_name: string | null; changed_at: Date; before: Record<string, unknown> | null; after: Record<string, unknown> | null }[]
  >`
    select l.action, l.before, l.after, l.changed_at, a.name as changed_by_name
    from audit_logs l
    left join agents a on a.id = l.changed_by
    where l.table_name = 'agents' and l.row_id = ${id}
    order by l.changed_at desc`;
  return rows.map((r) => ({ ...r, changed_at: r.changed_at.toISOString() }));
}
