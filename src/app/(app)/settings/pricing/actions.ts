"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import {
  createBaseRate, deactivateBaseRate,
  createSurcharge, deactivateSurcharge,
  createStopover, deactivateStopover,
  createVariable, deactivateVariable,
} from "@/lib/db/pricing";
import { estimatePrice, type EstimateResult } from "@/lib/pricing/estimate";

export interface PResult { ok: boolean; message: string }
async function actor(): Promise<string | undefined> {
  return (await requireAgent()).agent.name;
}
function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t || null;
}
function n(fd: FormData, k: string): number | null {
  const v = s(fd, k);
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}
function b(fd: FormData, k: string): boolean {
  return fd.get(k) === "on" || fd.get(k) === "true";
}
const rev = () => revalidatePath("/settings/pricing");

export async function addBaseRateAction(manualId: string, fd: FormData): Promise<PResult> {
  try {
    const vt = s(fd, "vehicle_type");
    if (!vt) return { ok: false, message: "차종을 입력하세요." };
    await createBaseRate(manualId, { vehicle_type: vt, base_price: n(fd, "base_price") ?? 0, base_condition: s(fd, "base_condition"), sort_order: n(fd, "sort_order") ?? 0 }, await actor());
    rev(); return { ok: true, message: "기본요금 추가" };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
export async function delBaseRateAction(id: string): Promise<PResult> {
  try { await deactivateBaseRate(id, await actor()); rev(); return { ok: true, message: "비활성화" }; }
  catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function addSurchargeAction(manualId: string, fd: FormData): Promise<PResult> {
  try {
    const name = s(fd, "name");
    if (!name) return { ok: false, message: "할증명을 입력하세요." };
    await createSurcharge(manualId, {
      name, surcharge_type: s(fd, "surcharge_type"), quick_amount: n(fd, "quick_amount"), truck_amount: n(fd, "truck_amount"),
      calculation_type: s(fd, "calculation_type") ?? "fixed", percent_min: n(fd, "percent_min"), percent_max: n(fd, "percent_max"),
      time_start: s(fd, "time_start"), time_end: s(fd, "time_end"), description: s(fd, "description"),
      requires_review: b(fd, "requires_review"), sort_order: n(fd, "sort_order") ?? 0,
    }, await actor());
    rev(); return { ok: true, message: "일반할증 추가" };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
export async function delSurchargeAction(id: string): Promise<PResult> {
  try { await deactivateSurcharge(id, await actor()); rev(); return { ok: true, message: "비활성화" }; }
  catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function addStopoverAction(manualId: string, fd: FormData): Promise<PResult> {
  try {
    const st = s(fd, "stopover_type"), vt = s(fd, "vehicle_type");
    if (!st || !vt) return { ok: false, message: "경유구분·차종을 입력하세요." };
    await createStopover(manualId, { stopover_type: st, vehicle_type: vt, amount: n(fd, "amount") ?? 0, description: s(fd, "description"), sort_order: n(fd, "sort_order") ?? 0 }, await actor());
    rev(); return { ok: true, message: "경유할증 추가" };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
export async function delStopoverAction(id: string): Promise<PResult> {
  try { await deactivateStopover(id, await actor()); rev(); return { ok: true, message: "비활성화" }; }
  catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function addVariableAction(manualId: string, fd: FormData): Promise<PResult> {
  try {
    const name = s(fd, "name");
    if (!name) return { ok: false, message: "항목명을 입력하세요." };
    await createVariable(manualId, { name, default_handling: s(fd, "default_handling") ?? "직원확인", default_amount: n(fd, "default_amount"), requires_review: b(fd, "requires_review"), description: s(fd, "description"), sort_order: n(fd, "sort_order") ?? 0 }, await actor());
    rev(); return { ok: true, message: "유동할증 추가" };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
export async function delVariableAction(id: string): Promise<PResult> {
  try { await deactivateVariable(id, await actor()); rev(); return { ok: true, message: "비활성화" }; }
  catch (e) { return { ok: false, message: (e as Error).message }; }
}

// 계산 테스트
export async function estimateTestAction(fd: FormData): Promise<{ ok: boolean; message: string; result?: EstimateResult }> {
  try {
    const r = await estimatePrice({
      vehicleType: s(fd, "vehicle_type"),
      originPricingArea: s(fd, "origin"),
      destinationPricingArea: s(fd, "destination"),
      requestedAt: s(fd, "requested_at"),
      isHoliday: b(fd, "is_holiday"),
      isRoundTrip: b(fd, "is_round_trip"),
      stopoverCount: n(fd, "stopover_count") ?? 0,
      stopoverType: (s(fd, "stopover_type") as "same_area" | "near_city" | "far" | null) ?? null,
      serviceType: s(fd, "service_type"),
      sourceType: "manual_test",
      byName: await actor(),
    });
    return { ok: true, message: "계산 완료", result: r };
  } catch (e) { return { ok: false, message: `계산 실패: ${(e as Error).message}` }; }
}
