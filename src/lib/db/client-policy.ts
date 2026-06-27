// 거래처 운임/요금 정책 + AI 업무규칙 데이터 계층.
//   정책: 거래처당 활성 1건(upsert). 규칙: 거래처당 다수.
//   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit 자동 기록.
import { sql, resolveAgentId } from "./client";

// ── 운임/요금 정책 ────────────────────────────────────────────────────
export interface PricingPolicy {
  id: string;
  base_fare: number | null;
  discount_rate: number | null;
  via_same_gu: number | null;
  via_other_gu: number | null;
  via_other_city: number | null;
  night_surcharge: number | null;
  holiday_surcharge: number | null;
  dispatch_surcharge: number | null;
  dispatch_surcharge_approval: boolean;
  load_fee: number | null;
  unload_fee: number | null;
  wait_fee: number | null;
  parking_fee: number | null;
  toll_included: boolean;
  special_surcharge_note: string | null;
  vehicle_rates: Record<string, number>;
  exceptions: string | null;
  notes: string | null;
}

const NUM_FIELDS = [
  "base_fare", "discount_rate", "via_same_gu", "via_other_gu", "via_other_city",
  "night_surcharge", "holiday_surcharge", "dispatch_surcharge",
  "load_fee", "unload_fee", "wait_fee", "parking_fee",
] as const;

export type PricingInput = Omit<PricingPolicy, "id">;

function toPolicy(r: Record<string, unknown>): PricingPolicy {
  const num = (k: string) => (r[k] != null ? Number(r[k]) : null);
  return {
    id: r.id as string,
    base_fare: num("base_fare"),
    discount_rate: num("discount_rate"),
    via_same_gu: num("via_same_gu"),
    via_other_gu: num("via_other_gu"),
    via_other_city: num("via_other_city"),
    night_surcharge: num("night_surcharge"),
    holiday_surcharge: num("holiday_surcharge"),
    dispatch_surcharge: num("dispatch_surcharge"),
    dispatch_surcharge_approval: Boolean(r.dispatch_surcharge_approval),
    load_fee: num("load_fee"),
    unload_fee: num("unload_fee"),
    wait_fee: num("wait_fee"),
    parking_fee: num("parking_fee"),
    toll_included: Boolean(r.toll_included),
    special_surcharge_note: (r.special_surcharge_note as string) ?? null,
    vehicle_rates: (r.vehicle_rates as Record<string, number>) ?? {},
    exceptions: (r.exceptions as string) ?? null,
    notes: (r.notes as string) ?? null,
  };
}

export async function getPricingPolicy(clientId: string): Promise<PricingPolicy | null> {
  const [r] = await sql<Record<string, unknown>[]>`
    select * from client_pricing_policies where client_id=${clientId} and is_active`;
  return r ? toPolicy(r) : null;
}

// 거래처당 활성 1건 — 있으면 update, 없으면 insert.
export async function savePricingPolicy(
  clientId: string,
  input: PricingInput,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  const nums = Object.fromEntries(NUM_FIELDS.map((k) => [k, input[k] ?? null]));
  const [existing] = await sql<{ id: string }[]>`
    select id from client_pricing_policies where client_id=${clientId} and is_active`;
  const common = {
    ...nums,
    dispatch_surcharge_approval: input.dispatch_surcharge_approval,
    toll_included: input.toll_included,
    special_surcharge_note: input.special_surcharge_note,
    vehicle_rates: sql.json(input.vehicle_rates as Record<string, number>),
    exceptions: input.exceptions,
    notes: input.notes,
    updated_by: by,
  };
  if (existing) {
    await sql`update client_pricing_policies set ${sql(common)} where id=${existing.id}`;
  } else {
    await sql`insert into client_pricing_policies ${sql({ ...common, client_id: clientId, created_by: by })}`;
  }
}

// ── AI 업무규칙 ───────────────────────────────────────────────────────
export interface ClientRule {
  id: string;
  client_id: string;
  name: string;
  rule_type: string;
  condition: string | null;
  content: string | null;
  example: string | null;
  priority: number;
  is_enabled: boolean;
  needs_review: boolean;
}

export interface RuleInput {
  name: string;
  rule_type?: string | null;
  condition?: string | null;
  content?: string | null;
  example?: string | null;
  priority?: number;
  is_enabled?: boolean;
  needs_review?: boolean;
}

export async function listRules(clientId: string): Promise<ClientRule[]> {
  return sql<ClientRule[]>`
    select id, client_id, name, rule_type, condition, content, example,
           priority, is_enabled, needs_review
    from client_rules
    where client_id=${clientId} and is_active
    order by priority desc, created_at`;
}

export async function createRule(clientId: string, input: RuleInput, byName?: string): Promise<string> {
  const by = await resolveAgentId(byName);
  const [row] = await sql<{ id: string }[]>`
    insert into client_rules
      (client_id, name, rule_type, condition, content, example, priority, is_enabled, needs_review, created_by, updated_by)
    values
      (${clientId}, ${input.name}, ${input.rule_type ?? "기타"}, ${input.condition ?? null},
       ${input.content ?? null}, ${input.example ?? null}, ${input.priority ?? 0},
       ${input.is_enabled ?? true}, ${input.needs_review ?? false}, ${by}, ${by})
    returning id`;
  return row.id;
}

export async function updateRule(id: string, input: RuleInput, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update client_rules set
      name=${input.name}, rule_type=${input.rule_type ?? "기타"}, condition=${input.condition ?? null},
      content=${input.content ?? null}, example=${input.example ?? null},
      priority=${input.priority ?? 0}, is_enabled=${input.is_enabled ?? true},
      needs_review=${input.needs_review ?? false}, updated_by=${by}
    where id=${id} and is_active`;
}

export async function deactivateRule(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('client_rules', ${id}, ${by})`;
}

// 논사원 AI 참고용 — 사용중인 규칙을 우선순위순 텍스트로(답변/운임/배차 초안에서 활용).
export async function getClientRulesText(clientId: string): Promise<string | null> {
  const rows = await sql<{ name: string; rule_type: string; content: string | null; condition: string | null }[]>`
    select name, rule_type, content, condition from client_rules
    where client_id=${clientId} and is_active and is_enabled
    order by priority desc, created_at limit 20`;
  if (rows.length === 0) return null;
  return rows
    .map((r) => `- [${r.rule_type}] ${r.name}${r.condition ? ` (조건: ${r.condition})` : ""}: ${r.content ?? ""}`)
    .join("\n");
}
