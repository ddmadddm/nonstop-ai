// 요금 계산(초안) — 우선순위: 거래처 단가표 → 거래처 규칙 → 공통 매뉴얼 → AI 추정.
//   원칙: 확정하지 않고 '요금 초안'만 제안. 애매/복잡/유동할증/단가표 없음 → 직원 확인 필요.
//   결과는 pricing_calculation_logs 에 근거(jsonb)와 함께 기록.
import "server-only";
import {
  getActiveManual, listBaseRates, listSurcharges, listStopovers, listVariables,
  findRateItem, logCalculation,
} from "@/lib/db/pricing";
import { getClientRulesText } from "@/lib/db/client-policy";

export type RuleType = "client_rate" | "client_rule" | "common_manual" | "ai_estimate";

export interface EstimateInput {
  clientId?: string | null;
  originRaw?: string | null;
  destinationRaw?: string | null;
  originPricingArea?: string | null;
  destinationPricingArea?: string | null;
  vehicleType?: string | null;
  requestedAt?: string | null;       // ISO datetime
  stopoverCount?: number;
  stopoverType?: "same_area" | "near_city" | "far" | null;
  isRoundTrip?: boolean;
  isHoliday?: boolean;
  serviceType?: string | null;       // 예: 수작업 / 기상악화 / 수배지연
  byName?: string;
  sourceType?: "assistant" | "consultation" | "manual_test";
  sourceId?: string | null;
}

export interface EstimateResult {
  suggestedPrice: number | null;
  selectedRuleType: RuleType;
  basePrice: number | null;
  surchargeTotal: number;
  discountAmount: number;
  confidence: number;
  requiresReview: boolean;
  warnings: string[];
  source: string;
  detail: Record<string, unknown>;
}

function isQuick(vt: string | null | undefined): boolean {
  return !!vt && /오토바이|퀵/.test(vt);
}
function hourOf(iso?: string | null): number | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}):/);
  return m ? Number(m[1]) : null;
}
function inWindow(hour: number, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const s = Number(start.slice(0, 2)), e = Number(end.slice(0, 2));
  return e > s ? hour >= s && hour < e : hour >= s || hour < e; // 자정 넘김 처리
}

const REVIEW_SERVICE = /수작업|기상|폭설|폭우|수배\s*지연/;

export async function estimatePrice(input: EstimateInput): Promise<EstimateResult> {
  const warnings: string[] = [];
  const detail: Record<string, unknown> = { input };
  const vt = input.vehicleType ?? null;

  // 1순위: 거래처 고정 단가표
  if (input.clientId) {
    const item = await findRateItem(
      input.clientId,
      input.originPricingArea ?? input.originRaw ?? null,
      input.destinationPricingArea ?? input.destinationRaw ?? null,
      vt,
    );
    if (item) {
      const price = item.billing_price ?? item.discounted_price ?? item.normal_price ?? null;
      let review = item.requires_review;
      if (item.stopover_rule || item.surcharge_rule) { warnings.push("단가표에 경유/할증 규칙이 있어 직원 확인 필요"); review = true; }
      detail.matchedRateItem = item;
      const r: EstimateResult = {
        suggestedPrice: price, selectedRuleType: "client_rate", basePrice: price, surchargeTotal: 0,
        discountAmount: item.normal_price && item.discounted_price ? item.normal_price - item.discounted_price : 0,
        confidence: 0.9, requiresReview: review || price == null, warnings, source: "거래처 단가표", detail,
      };
      await save(input, r);
      return r;
    }
    detail.rateItem = "없음(공통 매뉴얼 fallback)";
    // 2순위: 거래처 규칙(운임/할인/수배할증) — 있으면 직원 확인 신호
    const rules = await getClientRulesText(input.clientId);
    if (rules) { warnings.push("거래처 업무규칙 있음 — 적용 여부 직원 확인 필요"); detail.clientRules = rules; }
  }

  // 3순위: 공통 가격책정 매뉴얼
  const manual = await getActiveManual();
  if (!manual || !vt) {
    const r: EstimateResult = {
      suggestedPrice: null, selectedRuleType: "ai_estimate", basePrice: null, surchargeTotal: 0, discountAmount: 0,
      confidence: 0.2, requiresReview: true,
      warnings: [...warnings, manual ? "차종 미입력 — 직원 확인 필요" : "활성 매뉴얼 없음 — 직원 확인 필요"],
      source: "AI 추정", detail,
    };
    await save(input, r);
    return r;
  }

  const [bases, surs, stops, vars] = await Promise.all([
    listBaseRates(manual.id), listSurcharges(manual.id), listStopovers(manual.id), listVariables(manual.id),
  ]);
  const base = bases.find((b) => vt && (b.vehicle_type === vt || vt.includes(b.vehicle_type) || b.vehicle_type.includes(vt)));
  if (!base) {
    const r: EstimateResult = {
      suggestedPrice: null, selectedRuleType: "ai_estimate", basePrice: null, surchargeTotal: 0, discountAmount: 0,
      confidence: 0.25, requiresReview: true, warnings: [...warnings, `'${vt}' 기본요금 미정 — 직원 확인 필요`],
      source: "AI 추정", detail,
    };
    await save(input, r);
    return r;
  }

  const quick = isQuick(vt);
  let surchargeTotal = 0;
  let review = false;
  const applied: { name: string; amount: number; note?: string }[] = [];
  const amt = (s: { quick_amount: number | null; truck_amount: number | null }) => (quick ? s.quick_amount : s.truck_amount) ?? 0;

  for (const s of surs) {
    if (s.calculation_type === "fixed") {
      // 시간대 할증: requestedAt 시각이 창에 들어올 때만. 시간창 없는 항목(대기료/야상 등)은 자동 적용 안 함(직원 선택).
      if (s.time_start) {
        const h = hourOf(input.requestedAt);
        if (h != null && inWindow(h, s.time_start, s.time_end)) { const a = amt(s); surchargeTotal += a; applied.push({ name: s.name, amount: a }); }
      } else if (s.surcharge_type === "holiday" && input.isHoliday) {
        const a = amt(s); surchargeTotal += a; applied.push({ name: s.name, amount: a });
      }
      if (s.requires_review) review = true;
    } else if (s.calculation_type === "percent" || s.calculation_type === "range") {
      if (s.surcharge_type === "round_trip" && input.isRoundTrip) {
        const pct = (s.percent_min ?? 50) / 100;
        const a = Math.round(base.base_price * pct);
        surchargeTotal += a; applied.push({ name: s.name, amount: a, note: `기본요금 ${s.percent_min}~${s.percent_max}% 중 최소 적용` });
        warnings.push("왕복 할증 범위(%) — 직원 확인 필요"); review = true;
      }
    }
  }

  // 경유할증
  if ((input.stopoverCount ?? 0) > 0) {
    if (input.stopoverType) {
      const st = stops.find((s) => s.stopover_type === input.stopoverType && (vt!.includes(s.vehicle_type) || s.vehicle_type.includes(vt!)));
      if (st) { const a = st.amount * (input.stopoverCount ?? 1); surchargeTotal += a; applied.push({ name: `경유(${input.stopoverType})`, amount: a }); }
      else { warnings.push("경유 차종/구분 매칭 실패 — 직원 확인 필요"); review = true; }
    } else { warnings.push("경유 구분(같은구/타도시/먼거리) 미지정 — 직원 확인 필요"); review = true; }
  }

  // 유동할증(수작업/기상/수배지연) → 항상 직원 확인
  if (input.serviceType && REVIEW_SERVICE.test(input.serviceType)) {
    const v = vars.find((x) => input.serviceType && x.name.includes(input.serviceType.slice(0, 2)));
    warnings.push(`유동할증(${input.serviceType}) 포함 — ${v?.default_handling ?? "별도협의"}, 직원 확인 필요`);
    review = true;
  }
  if (warnings.length > 0) review = true;

  detail.manual = { id: manual.id, version: manual.version };
  detail.base = base;
  detail.appliedSurcharges = applied;

  const suggested = base.base_price + surchargeTotal;
  const r: EstimateResult = {
    suggestedPrice: suggested, selectedRuleType: "common_manual", basePrice: base.base_price, surchargeTotal,
    discountAmount: 0, confidence: review ? 0.5 : 0.7, requiresReview: review, warnings,
    source: `공통 매뉴얼 v${manual.version}`, detail,
  };
  await save(input, r);
  return r;
}

async function save(input: EstimateInput, r: EstimateResult): Promise<void> {
  await logCalculation({
    clientId: input.clientId ?? null,
    sourceType: input.sourceType ?? "manual_test",
    sourceId: input.sourceId ?? null,
    originRaw: input.originRaw ?? null, destinationRaw: input.destinationRaw ?? null,
    originPricingArea: input.originPricingArea ?? null, destinationPricingArea: input.destinationPricingArea ?? null,
    vehicleType: input.vehicleType ?? null,
    selectedRuleType: r.selectedRuleType, basePrice: r.basePrice, surchargeTotal: r.surchargeTotal,
    discountAmount: r.discountAmount, finalSuggestedPrice: r.suggestedPrice, confidence: r.confidence,
    requiresReview: r.requiresReview, calculationDetail: r.detail, byName: input.byName,
  }).catch(() => {});
}
