// 운임/요금 — 공통 가격책정 매뉴얼 + 거래처별 단가표 + 계산이력.
//   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit 자동 기록.
import { sql, resolveAgentId } from "./client";

const num = (v: unknown) => (v != null ? Number(v) : null);

// ── 매뉴얼 ────────────────────────────────────────────────────────────
export interface PricingManual {
  id: string; name: string; version: number; description: string | null;
  effective_from: string | null; is_active: boolean;
}
export async function getActiveManual(): Promise<PricingManual | null> {
  const [r] = await sql<(Omit<PricingManual, "effective_from"> & { effective_from: Date | null })[]>`
    select id, name, version, description, effective_from, is_active
    from pricing_manuals where is_active order by version desc limit 1`;
  return r ? { ...r, effective_from: r.effective_from ? r.effective_from.toISOString().slice(0, 10) : null } : null;
}
export async function listManuals(): Promise<PricingManual[]> {
  const rows = await sql<(Omit<PricingManual, "effective_from"> & { effective_from: Date | null })[]>`
    select id, name, version, description, effective_from, is_active
    from pricing_manuals order by version desc`;
  return rows.map((r) => ({ ...r, effective_from: r.effective_from ? r.effective_from.toISOString().slice(0, 10) : null }));
}

// ── 기본요금 ──────────────────────────────────────────────────────────
export interface BaseRate {
  id: string; vehicle_type: string; base_price: number; base_condition: string | null; sort_order: number;
}
export async function listBaseRates(manualId: string): Promise<BaseRate[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, vehicle_type, base_price, base_condition, sort_order
    from pricing_base_rates where manual_id=${manualId} and is_active order by sort_order, vehicle_type`;
  return rows.map((r) => ({ id: r.id as string, vehicle_type: r.vehicle_type as string, base_price: Number(r.base_price), base_condition: (r.base_condition as string) ?? null, sort_order: r.sort_order as number }));
}
export async function createBaseRate(manualId: string, i: { vehicle_type: string; base_price: number; base_condition?: string | null; sort_order?: number }, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`insert into pricing_base_rates (manual_id, vehicle_type, base_price, base_condition, sort_order, created_by, updated_by)
    values (${manualId}, ${i.vehicle_type}, ${i.base_price}, ${i.base_condition ?? null}, ${i.sort_order ?? 0}, ${by}, ${by})`;
}
export async function updateBaseRate(id: string, i: { vehicle_type: string; base_price: number; base_condition?: string | null; sort_order?: number }, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`update pricing_base_rates set vehicle_type=${i.vehicle_type}, base_price=${i.base_price}, base_condition=${i.base_condition ?? null}, sort_order=${i.sort_order ?? 0}, updated_by=${by} where id=${id} and is_active`;
}
export async function deactivateBaseRate(id: string, byName?: string) {
  await sql`select fn_deactivate('pricing_base_rates', ${id}, ${await resolveAgentId(byName)})`;
}

// ── 일반할증 ──────────────────────────────────────────────────────────
export interface Surcharge {
  id: string; surcharge_type: string | null; name: string; quick_amount: number | null; truck_amount: number | null;
  calculation_type: string; percent_min: number | null; percent_max: number | null;
  time_start: string | null; time_end: string | null; description: string | null; requires_review: boolean; sort_order: number;
}
export async function listSurcharges(manualId: string): Promise<Surcharge[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, surcharge_type, name, quick_amount, truck_amount, calculation_type, percent_min, percent_max,
           time_start, time_end, description, requires_review, sort_order
    from pricing_surcharges where manual_id=${manualId} and is_active order by sort_order, name`;
  return rows.map((r) => ({
    id: r.id as string, surcharge_type: (r.surcharge_type as string) ?? null, name: r.name as string,
    quick_amount: num(r.quick_amount), truck_amount: num(r.truck_amount), calculation_type: r.calculation_type as string,
    percent_min: num(r.percent_min), percent_max: num(r.percent_max), time_start: (r.time_start as string) ?? null,
    time_end: (r.time_end as string) ?? null, description: (r.description as string) ?? null,
    requires_review: Boolean(r.requires_review), sort_order: r.sort_order as number,
  }));
}
export interface SurchargeInput {
  name: string; surcharge_type?: string | null; quick_amount?: number | null; truck_amount?: number | null;
  calculation_type?: string; percent_min?: number | null; percent_max?: number | null;
  time_start?: string | null; time_end?: string | null; description?: string | null; requires_review?: boolean; sort_order?: number;
}
export async function createSurcharge(manualId: string, i: SurchargeInput, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`insert into pricing_surcharges
    (manual_id, surcharge_type, name, quick_amount, truck_amount, calculation_type, percent_min, percent_max, time_start, time_end, description, requires_review, sort_order, created_by, updated_by)
    values (${manualId}, ${i.surcharge_type ?? null}, ${i.name}, ${i.quick_amount ?? null}, ${i.truck_amount ?? null}, ${i.calculation_type ?? "fixed"}, ${i.percent_min ?? null}, ${i.percent_max ?? null}, ${i.time_start ?? null}, ${i.time_end ?? null}, ${i.description ?? null}, ${i.requires_review ?? false}, ${i.sort_order ?? 0}, ${by}, ${by})`;
}
export async function updateSurcharge(id: string, i: SurchargeInput, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`update pricing_surcharges set surcharge_type=${i.surcharge_type ?? null}, name=${i.name}, quick_amount=${i.quick_amount ?? null}, truck_amount=${i.truck_amount ?? null}, calculation_type=${i.calculation_type ?? "fixed"}, percent_min=${i.percent_min ?? null}, percent_max=${i.percent_max ?? null}, time_start=${i.time_start ?? null}, time_end=${i.time_end ?? null}, description=${i.description ?? null}, requires_review=${i.requires_review ?? false}, sort_order=${i.sort_order ?? 0}, updated_by=${by} where id=${id} and is_active`;
}
export async function deactivateSurcharge(id: string, byName?: string) {
  await sql`select fn_deactivate('pricing_surcharges', ${id}, ${await resolveAgentId(byName)})`;
}

// ── 경유할증 ──────────────────────────────────────────────────────────
export interface Stopover { id: string; stopover_type: string; vehicle_type: string; amount: number; description: string | null; sort_order: number; }
export async function listStopovers(manualId: string): Promise<Stopover[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, stopover_type, vehicle_type, amount, description, sort_order
    from pricing_stopover_surcharges where manual_id=${manualId} and is_active order by sort_order`;
  return rows.map((r) => ({ id: r.id as string, stopover_type: r.stopover_type as string, vehicle_type: r.vehicle_type as string, amount: Number(r.amount), description: (r.description as string) ?? null, sort_order: r.sort_order as number }));
}
export async function createStopover(manualId: string, i: { stopover_type: string; vehicle_type: string; amount: number; description?: string | null; sort_order?: number }, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`insert into pricing_stopover_surcharges (manual_id, stopover_type, vehicle_type, amount, description, sort_order, created_by, updated_by)
    values (${manualId}, ${i.stopover_type}, ${i.vehicle_type}, ${i.amount}, ${i.description ?? null}, ${i.sort_order ?? 0}, ${by}, ${by})`;
}
export async function updateStopover(id: string, i: { stopover_type: string; vehicle_type: string; amount: number; description?: string | null; sort_order?: number }, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`update pricing_stopover_surcharges set stopover_type=${i.stopover_type}, vehicle_type=${i.vehicle_type}, amount=${i.amount}, description=${i.description ?? null}, sort_order=${i.sort_order ?? 0}, updated_by=${by} where id=${id} and is_active`;
}
export async function deactivateStopover(id: string, byName?: string) {
  await sql`select fn_deactivate('pricing_stopover_surcharges', ${id}, ${await resolveAgentId(byName)})`;
}

// ── 기타 유동할증 ─────────────────────────────────────────────────────
export interface Variable { id: string; name: string; default_handling: string; default_amount: number | null; requires_review: boolean; description: string | null; sort_order: number; }
export async function listVariables(manualId: string): Promise<Variable[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, name, default_handling, default_amount, requires_review, description, sort_order
    from pricing_variable_surcharges where manual_id=${manualId} and is_active order by sort_order, name`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, default_handling: r.default_handling as string, default_amount: num(r.default_amount), requires_review: Boolean(r.requires_review), description: (r.description as string) ?? null, sort_order: r.sort_order as number }));
}
export async function createVariable(manualId: string, i: { name: string; default_handling?: string; default_amount?: number | null; requires_review?: boolean; description?: string | null; sort_order?: number }, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`insert into pricing_variable_surcharges (manual_id, name, default_handling, default_amount, requires_review, description, sort_order, created_by, updated_by)
    values (${manualId}, ${i.name}, ${i.default_handling ?? "직원확인"}, ${i.default_amount ?? null}, ${i.requires_review ?? true}, ${i.description ?? null}, ${i.sort_order ?? 0}, ${by}, ${by})`;
}
export async function updateVariable(id: string, i: { name: string; default_handling?: string; default_amount?: number | null; requires_review?: boolean; description?: string | null; sort_order?: number }, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`update pricing_variable_surcharges set name=${i.name}, default_handling=${i.default_handling ?? "직원확인"}, default_amount=${i.default_amount ?? null}, requires_review=${i.requires_review ?? true}, description=${i.description ?? null}, sort_order=${i.sort_order ?? 0}, updated_by=${by} where id=${id} and is_active`;
}
export async function deactivateVariable(id: string, byName?: string) {
  await sql`select fn_deactivate('pricing_variable_surcharges', ${id}, ${await resolveAgentId(byName)})`;
}

// ── 거래처별 단가표 ───────────────────────────────────────────────────
export interface RateSheet {
  id: string; client_id: string; title: string; file_name: string | null; origin_base_area: string | null;
  version: number; effective_from: string | null; status: string; memo: string | null; created_at: string;
}
export async function listRateSheets(clientId: string): Promise<RateSheet[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, client_id, title, file_name, origin_base_area, version, effective_from, status, memo, created_at
    from client_rate_sheets where client_id=${clientId} and is_active order by created_at desc`;
  return rows.map((r) => ({
    id: r.id as string, client_id: r.client_id as string, title: r.title as string, file_name: (r.file_name as string) ?? null,
    origin_base_area: (r.origin_base_area as string) ?? null, version: r.version as number,
    effective_from: r.effective_from ? (r.effective_from as Date).toISOString().slice(0, 10) : null,
    status: r.status as string, memo: (r.memo as string) ?? null, created_at: (r.created_at as Date).toISOString(),
  }));
}
export async function createRateSheet(clientId: string, i: { title: string; file_name?: string | null; stored_path?: string | null; origin_base_area?: string | null; effective_from?: string | null; memo?: string | null }, byName?: string): Promise<string> {
  const by = await resolveAgentId(byName);
  const [r] = await sql<{ id: string }[]>`
    insert into client_rate_sheets (client_id, title, file_name, stored_path, origin_base_area, effective_from, memo, status, created_by, updated_by)
    values (${clientId}, ${i.title}, ${i.file_name ?? null}, ${i.stored_path ?? null}, ${i.origin_base_area ?? null}, ${i.effective_from ?? null}, ${i.memo ?? null}, 'draft', ${by}, ${by})
    returning id`;
  return r.id;
}
export async function setRateSheetStatus(id: string, status: "draft" | "active" | "archived", byName?: string) {
  await sql`update client_rate_sheets set status=${status}, updated_by=${await resolveAgentId(byName)} where id=${id} and is_active`;
}
export async function deactivateRateSheet(id: string, byName?: string) {
  await sql`select fn_deactivate('client_rate_sheets', ${id}, ${await resolveAgentId(byName)})`;
}

export interface RateItem {
  id: string; origin_area: string | null; destination_area: string | null; vehicle_type: string | null;
  normal_price: number | null; discounted_price: number | null; competitive_price: number | null; billing_price: number | null;
  driver_price_reference: number | null; stopover_rule: string | null; surcharge_rule: string | null;
  memo: string | null; requires_review: boolean; confidence: number | null; sort_order: number;
}
export async function listRateItems(rateSheetId: string): Promise<RateItem[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, origin_area, destination_area, vehicle_type, normal_price, discounted_price, competitive_price,
           billing_price, driver_price_reference, stopover_rule, surcharge_rule, memo, requires_review, confidence, sort_order
    from client_rate_items where rate_sheet_id=${rateSheetId} and is_active order by sort_order, origin_area`;
  return rows.map((r) => ({
    id: r.id as string, origin_area: (r.origin_area as string) ?? null, destination_area: (r.destination_area as string) ?? null,
    vehicle_type: (r.vehicle_type as string) ?? null, normal_price: num(r.normal_price), discounted_price: num(r.discounted_price),
    competitive_price: num(r.competitive_price), billing_price: num(r.billing_price), driver_price_reference: num(r.driver_price_reference),
    stopover_rule: (r.stopover_rule as string) ?? null, surcharge_rule: (r.surcharge_rule as string) ?? null,
    memo: (r.memo as string) ?? null, requires_review: Boolean(r.requires_review), confidence: num(r.confidence), sort_order: r.sort_order as number,
  }));
}
export interface RateItemInput {
  origin_area?: string | null; destination_area?: string | null; vehicle_type?: string | null;
  normal_price?: number | null; discounted_price?: number | null; competitive_price?: number | null; billing_price?: number | null;
  driver_price_reference?: number | null; stopover_rule?: string | null; surcharge_rule?: string | null;
  memo?: string | null; requires_review?: boolean; sort_order?: number;
}
export async function createRateItem(rateSheetId: string, clientId: string, i: RateItemInput, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`insert into client_rate_items
    (rate_sheet_id, client_id, origin_area, destination_area, vehicle_type, normal_price, discounted_price, competitive_price, billing_price, driver_price_reference, stopover_rule, surcharge_rule, memo, requires_review, sort_order, created_by, updated_by)
    values (${rateSheetId}, ${clientId}, ${i.origin_area ?? null}, ${i.destination_area ?? null}, ${i.vehicle_type ?? null}, ${i.normal_price ?? null}, ${i.discounted_price ?? null}, ${i.competitive_price ?? null}, ${i.billing_price ?? null}, ${i.driver_price_reference ?? null}, ${i.stopover_rule ?? null}, ${i.surcharge_rule ?? null}, ${i.memo ?? null}, ${i.requires_review ?? false}, ${i.sort_order ?? 0}, ${by}, ${by})`;
}
export async function updateRateItem(id: string, i: RateItemInput, byName?: string) {
  const by = await resolveAgentId(byName);
  await sql`update client_rate_items set origin_area=${i.origin_area ?? null}, destination_area=${i.destination_area ?? null}, vehicle_type=${i.vehicle_type ?? null}, normal_price=${i.normal_price ?? null}, discounted_price=${i.discounted_price ?? null}, competitive_price=${i.competitive_price ?? null}, billing_price=${i.billing_price ?? null}, driver_price_reference=${i.driver_price_reference ?? null}, stopover_rule=${i.stopover_rule ?? null}, surcharge_rule=${i.surcharge_rule ?? null}, memo=${i.memo ?? null}, requires_review=${i.requires_review ?? false}, sort_order=${i.sort_order ?? 0}, updated_by=${by} where id=${id} and is_active`;
}
export async function deactivateRateItem(id: string, byName?: string) {
  await sql`select fn_deactivate('client_rate_items', ${id}, ${await resolveAgentId(byName)})`;
}

// 거래처 단가표에서 출발/도착/차종으로 매칭 항목 1건(요금 계산용).
export async function findRateItem(clientId: string, originArea: string | null, destArea: string | null, vehicleType: string | null): Promise<RateItem | null> {
  const rows = await sql<Record<string, unknown>[]>`
    select i.id, i.origin_area, i.destination_area, i.vehicle_type, i.normal_price, i.discounted_price, i.competitive_price,
           i.billing_price, i.driver_price_reference, i.stopover_rule, i.surcharge_rule, i.memo, i.requires_review, i.confidence, i.sort_order
    from client_rate_items i
    join client_rate_sheets s on s.id=i.rate_sheet_id and s.is_active and s.status='active'
    where i.is_active and i.client_id=${clientId}
      and (${vehicleType}::text is null or i.vehicle_type is null or i.vehicle_type ilike ${vehicleType})
      and (${originArea}::text is null or i.origin_area is null or ${originArea} ilike '%'||i.origin_area||'%' or i.origin_area ilike '%'||${originArea}||'%')
      and (${destArea}::text is null or i.destination_area is null or ${destArea} ilike '%'||i.destination_area||'%' or i.destination_area ilike '%'||${destArea}||'%')
    order by i.sort_order limit 1`;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id as string, origin_area: (r.origin_area as string) ?? null, destination_area: (r.destination_area as string) ?? null,
    vehicle_type: (r.vehicle_type as string) ?? null, normal_price: num(r.normal_price), discounted_price: num(r.discounted_price),
    competitive_price: num(r.competitive_price), billing_price: num(r.billing_price), driver_price_reference: num(r.driver_price_reference),
    stopover_rule: (r.stopover_rule as string) ?? null, surcharge_rule: (r.surcharge_rule as string) ?? null,
    memo: (r.memo as string) ?? null, requires_review: Boolean(r.requires_review), confidence: num(r.confidence), sort_order: r.sort_order as number,
  };
}

// ── 계산 이력 ─────────────────────────────────────────────────────────
export async function logCalculation(input: {
  clientId?: string | null; sourceType: string; sourceId?: string | null;
  originRaw?: string | null; destinationRaw?: string | null; originPricingArea?: string | null; destinationPricingArea?: string | null;
  vehicleType?: string | null; selectedRuleType: string; basePrice?: number | null; surchargeTotal?: number | null;
  discountAmount?: number | null; finalSuggestedPrice?: number | null; confidence?: number | null; requiresReview: boolean;
  calculationDetail: unknown; byName?: string;
}): Promise<void> {
  const by = await resolveAgentId(input.byName);
  await sql`insert into pricing_calculation_logs
    (client_id, source_type, source_id, origin_raw, destination_raw, origin_pricing_area, destination_pricing_area, vehicle_type, selected_rule_type, base_price, surcharge_total, discount_amount, final_suggested_price, confidence, requires_review, calculation_detail, created_by)
    values (${input.clientId ?? null}, ${input.sourceType}, ${input.sourceId ?? null}, ${input.originRaw ?? null}, ${input.destinationRaw ?? null}, ${input.originPricingArea ?? null}, ${input.destinationPricingArea ?? null}, ${input.vehicleType ?? null}, ${input.selectedRuleType}, ${input.basePrice ?? null}, ${input.surchargeTotal ?? null}, ${input.discountAmount ?? null}, ${input.finalSuggestedPrice ?? null}, ${input.confidence ?? null}, ${input.requiresReview}, ${sql.json(input.calculationDetail as Parameters<typeof sql.json>[0])}, ${by})`;
}
