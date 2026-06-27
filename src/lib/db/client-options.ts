// 거래처 항목(드롭다운 옵션) 관리 — 카테고리 + 옵션.
//   거래처 선택값(관계/유입·결제방식·역할·주소카테고리 등)을 DB에서 직원이 직접 관리.
//   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit 자동 기록.
import { sql, resolveAgentId } from "./client";

export interface OptionCategory {
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
}
export interface ClientOption {
  id: string;
  category_key: string;
  label: string;
  value: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export async function listCategories(): Promise<OptionCategory[]> {
  return sql<OptionCategory[]>`
    select key, name, description, sort_order from client_option_categories
    where is_active order by sort_order, name`;
}

// 한 카테고리의 활성 옵션(폼 셀렉트용).
export async function listOptions(categoryKey: string): Promise<ClientOption[]> {
  return sql<ClientOption[]>`
    select id, category_key, label, value, color, sort_order, is_active
    from client_options
    where category_key=${categoryKey} and is_active
    order by sort_order, label`;
}

// 설정 화면용 — 비활성 포함 전체.
export async function listAllOptions(categoryKey: string): Promise<ClientOption[]> {
  return sql<ClientOption[]>`
    select id, category_key, label, value, color, sort_order, is_active
    from client_options
    where category_key=${categoryKey}
    order by is_active desc, sort_order, label`;
}

// 카테고리별 항목 사용건수 — 설정 목록의 '사용건수' 컬럼.
async function optionUsage(categoryKey: string): Promise<Map<string, number>> {
  let rows: { value: string | null; n: number }[] = [];
  if (categoryKey === "relationship")
    rows = await sql`select relationship_type as value, count(*)::int n from clients where is_active and relationship_type is not null group by relationship_type`;
  else if (categoryKey === "client_type")
    rows = await sql`select client_type as value, count(*)::int n from clients where is_active group by client_type`;
  else if (categoryKey === "payment")
    rows = await sql`select default_payment_method as value, count(*)::int n from clients where is_active and default_payment_method is not null group by default_payment_method`;
  else if (categoryKey === "contact_role")
    rows = await sql`select role as value, count(*)::int n from client_contacts where is_active and role is not null group by role`;
  else if (categoryKey === "address_category")
    rows = await sql`select address_category as value, count(*)::int n from client_addresses where is_active and address_category is not null group by address_category`;
  else if (categoryKey === "address_verify")
    rows = await sql`select verify_status as value, count(*)::int n from client_addresses where is_active group by verify_status`;
  const m = new Map<string, number>();
  for (const r of rows) if (r.value) m.set(r.value, Number(r.n));
  return m;
}

export interface ManagedOption extends ClientOption {
  created_at: string;
  usage_count: number;
}
export async function listManagedOptions(categoryKey: string): Promise<ManagedOption[]> {
  const [rows, usage] = await Promise.all([
    sql<(ClientOption & { created_at: Date })[]>`
      select id, category_key, label, value, color, sort_order, is_active, created_at
      from client_options where category_key=${categoryKey}
      order by is_active desc, sort_order, label`,
    optionUsage(categoryKey),
  ]);
  return rows.map((r) => ({
    ...r,
    created_at: r.created_at.toISOString(),
    usage_count: usage.get(r.value) ?? 0,
  }));
}

export interface OptionInput {
  label: string;
  value?: string | null; // 미지정 시 label 사용
  color?: string | null;
  sort_order?: number;
}

export async function createOption(categoryKey: string, input: OptionInput, byName?: string): Promise<string> {
  const by = await resolveAgentId(byName);
  const value = (input.value ?? input.label).trim();
  // 동일 값이 비활성으로 있으면 되살린다(유니크 충돌 방지).
  const [revived] = await sql<{ id: string }[]>`
    update client_options set is_active=true, label=${input.label}, color=${input.color ?? null},
           deactivated_at=null, deactivated_by=null, updated_by=${by}
    where category_key=${categoryKey} and value=${value} and not is_active
    returning id`;
  if (revived) return revived.id;
  const [row] = await sql<{ id: string }[]>`
    insert into client_options (category_key, label, value, color, sort_order, created_by, updated_by)
    values (${categoryKey}, ${input.label}, ${value}, ${input.color ?? null}, ${input.sort_order ?? 0}, ${by}, ${by})
    returning id`;
  return row.id;
}

export async function updateOption(id: string, input: OptionInput, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update client_options set label=${input.label}, color=${input.color ?? null},
           sort_order=${input.sort_order ?? 0}, updated_by=${by}
    where id=${id} and is_active`;
}

// 비활성화(삭제 대체). 물리삭제는 트리거가 차단 → 사용중 항목도 안전하게 비활성만 가능.
export async function deactivateOption(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('client_options', ${id}, ${by})`;
}

// 사용중 여부(거래처가 이 관계/유입 값을 쓰고 있나) — 설정 화면 경고용.
export async function relationshipUsageCount(value: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int n from clients where is_active and relationship_type=${value}`;
  return r?.n ?? 0;
}
