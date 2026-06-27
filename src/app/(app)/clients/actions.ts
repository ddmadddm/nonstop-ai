"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import {
  createClient,
  updateClient,
  deactivateClient,
  exportClients,
  findActiveClientIdByName,
  type ClientInput,
  setDefaultOrigin,
  createContact,
  updateContact,
  deactivateContact,
  createAddress,
  updateAddress,
  deactivateAddress,
  generateMatches,
  confirmCandidateMatch,
  saveCandidateAsNew,
  rejectCandidate,
  type AddressUsage,
} from "@/lib/db/clients";
import { buildClientKnowledge } from "@/lib/db/knowledge";
import {
  savePricingPolicy,
  createRule,
  updateRule,
  deactivateRule,
  type PricingInput,
  type RuleInput,
} from "@/lib/db/client-policy";
import {
  createDispatch,
  deactivateDispatch,
  createSettlement,
  deactivateSettlement,
  createDocument,
  deactivateDocument,
} from "@/lib/db/client-records";
import { VEHICLE_TYPES, DOC_TYPES } from "@/lib/clients-meta";
import { getActorName } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

// 등록자/검수자 = 로그인 사용자(세션). 미상이면 undefined.
async function actor(): Promise<string | undefined> {
  return (await getActorName()) ?? undefined;
}

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}
function bool(fd: FormData, k: string): boolean {
  return fd.get(k) === "on" || fd.get(k) === "true";
}
function num(fd: FormData, k: string): number | null {
  const s = str(fd, k);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function list(fd: FormData, k: string): string[] {
  const v = str(fd, k);
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// ── 거래처 ───────────────────────────────────────────────────────────
export async function createClientAction(fd: FormData): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "거래처명을 입력하세요." };
    const id = await createClient(
      {
        name,
        client_type: str(fd, "client_type"),
        relationship_type: str(fd, "relationship_type"),
        business_no: str(fd, "business_no"),
        ceo_name: str(fd, "ceo_name"),
        email: str(fd, "email"),
        address: str(fd, "address"),
        phone: str(fd, "phone"),
        started_on: str(fd, "started_on"),
        tax_invoice: bool(fd, "tax_invoice"),
        default_payment_method: str(fd, "default_payment_method"),
        default_discount_rate: num(fd, "default_discount_rate"),
        default_vehicle_type: str(fd, "default_vehicle_type"),
        frequent_vehicle_types: list(fd, "frequent_vehicle_types"),
        fare_terms: str(fd, "fare_terms"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath("/clients");
    return { ok: true, message: "거래처 등록 완료", id };
  } catch (e) {
    return { ok: false, message: `등록 실패: ${(e as Error).message}` };
  }
}

export async function updateClientAction(
  id: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "거래처명을 입력하세요." };
    await updateClient(
      id,
      {
        name,
        client_type: str(fd, "client_type"),
        relationship_type: str(fd, "relationship_type"),
        business_no: str(fd, "business_no"),
        ceo_name: str(fd, "ceo_name"),
        email: str(fd, "email"),
        address: str(fd, "address"),
        phone: str(fd, "phone"),
        started_on: str(fd, "started_on"),
        tax_invoice: bool(fd, "tax_invoice"),
        default_payment_method: str(fd, "default_payment_method"),
        default_discount_rate: num(fd, "default_discount_rate"),
        default_vehicle_type: str(fd, "default_vehicle_type"),
        frequent_vehicle_types: list(fd, "frequent_vehicle_types"),
        fare_terms: str(fd, "fare_terms"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return { ok: true, message: "저장 완료" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateClientAction(id: string): Promise<ActionResult> {
  try {
    await deactivateClient(id, await actor());
    revalidatePath("/clients");
    return { ok: true, message: "거래처를 비활성화했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── 엑셀 다운로드 / 업로드 ────────────────────────────────────────────
//   다운로드한 파일을 편집해 그대로 업로드하면 거래처명 기준 upsert(있으면 수정, 없으면 추가).
const EXCEL_COLS: { h: string; k: keyof ClientInput }[] = [
  { h: "거래처명", k: "name" },
  { h: "거래처구분", k: "client_type" },
  { h: "관계/유입", k: "relationship_type" },
  { h: "사업자번호", k: "business_no" },
  { h: "대표자명", k: "ceo_name" },
  { h: "대표연락처", k: "phone" },
  { h: "이메일", k: "email" },
  { h: "주소", k: "address" },
  { h: "거래시작일", k: "started_on" },
  { h: "결제방식", k: "default_payment_method" },
  { h: "기본할인율", k: "default_discount_rate" },
  { h: "기본차종", k: "default_vehicle_type" },
  { h: "요금조건", k: "fare_terms" },
  { h: "메모", k: "memo" },
];

export async function exportClientsAction(): Promise<{ ok: boolean; message: string; base64?: string; filename?: string }> {
  try {
    await actor();
    const rows = await exportClients();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("거래처");
    ws.addRow(EXCEL_COLS.map((c) => c.h)).font = { bold: true };
    for (const r of rows) {
      const rec = r as unknown as Record<string, unknown>;
      ws.addRow(EXCEL_COLS.map((c) => rec[c.k] ?? ""));
    }
    EXCEL_COLS.forEach((_, i) => { ws.getColumn(i + 1).width = 16; });
    const buf = await wb.xlsx.writeBuffer();
    return {
      ok: true,
      message: `${rows.length}건`,
      base64: Buffer.from(buf).toString("base64"),
      filename: "거래처목록.xlsx",
    };
  } catch (e) {
    return { ok: false, message: `내보내기 실패: ${(e as Error).message}` };
  }
}

export interface ImportResult {
  ok: boolean;
  message: string;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function cellText(row: ExcelJS.Row, idx: Record<string, number>, header: string): string | null {
  const col = idx[header];
  if (!col) return null;
  const v = row.getCell(col).value as unknown;
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("").trim() || null;
    if (o.text != null) return String(o.text).trim() || null;
    if (o.result != null) return String(o.result).trim() || null;
    return null;
  }
  return String(v).trim() || null;
}

export async function importClientsAction(fd: FormData): Promise<ImportResult> {
  const empty = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  try {
    const by = await actor();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "파일을 선택하세요.", ...empty };
    if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, message: "xlsx 파일만 지원합니다(다운로드 양식 사용).", ...empty };

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) return { ok: false, message: "시트를 찾을 수 없습니다.", ...empty };

    const idx: Record<string, number> = {};
    ws.getRow(1).eachCell((cell, col) => { idx[String(cell.value ?? "").trim()] = col; });
    if (!idx["거래처명"]) return { ok: false, message: "'거래처명' 헤더가 없습니다. 다운로드 양식을 사용하세요.", ...empty };

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];
    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const name = cellText(row, idx, "거래처명");
      if (!name) { skipped++; continue; }
      try {
        const discount = cellText(row, idx, "기본할인율");
        const input: ClientInput = {
          name,
          client_type: cellText(row, idx, "거래처구분"),
          relationship_type: cellText(row, idx, "관계/유입"),
          business_no: cellText(row, idx, "사업자번호"),
          ceo_name: cellText(row, idx, "대표자명"),
          phone: cellText(row, idx, "대표연락처"),
          email: cellText(row, idx, "이메일"),
          address: cellText(row, idx, "주소"),
          started_on: cellText(row, idx, "거래시작일"),
          default_payment_method: cellText(row, idx, "결제방식"),
          default_discount_rate: discount != null && Number.isFinite(Number(discount)) ? Number(discount) : null,
          default_vehicle_type: cellText(row, idx, "기본차종"),
          fare_terms: cellText(row, idx, "요금조건"),
          memo: cellText(row, idx, "메모"),
        };
        const existing = await findActiveClientIdByName(name);
        if (existing) { await updateClient(existing, input, by); updated++; }
        else { await createClient(input, by); created++; }
      } catch (e) {
        errors.push(`${name}: ${(e as Error).message}`);
      }
    }
    revalidatePath("/clients");
    return {
      ok: true,
      message: `완료 — 추가 ${created} · 수정 ${updated} · 건너뜀 ${skipped}${errors.length ? ` · 오류 ${errors.length}` : ""}`,
      created, updated, skipped, errors,
    };
  } catch (e) {
    return { ok: false, message: `업로드 실패: ${(e as Error).message}`, ...empty };
  }
}

export async function setDefaultOriginAction(
  clientId: string,
  addressId: string | null,
): Promise<ActionResult> {
  try {
    await setDefaultOrigin(clientId, addressId, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "기본 출발지를 설정했습니다." };
  } catch (e) {
    return { ok: false, message: `설정 실패: ${(e as Error).message}` };
  }
}

// ── 담당자 ───────────────────────────────────────────────────────────
export async function createContactAction(
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "담당자명을 입력하세요." };
    await createContact(
      clientId,
      {
        name,
        department: str(fd, "department"),
        title: str(fd, "title"),
        role: str(fd, "role"),
        phone: str(fd, "phone"),
        email: str(fd, "email"),
        kakao_display_name: str(fd, "kakao_display_name"),
        is_primary: bool(fd, "is_primary"),
        is_resigned: bool(fd, "is_resigned"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "담당자 추가 완료" };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}

export async function updateContactAction(
  id: string,
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "담당자명을 입력하세요." };
    await updateContact(
      id,
      {
        name,
        department: str(fd, "department"),
        title: str(fd, "title"),
        role: str(fd, "role"),
        phone: str(fd, "phone"),
        email: str(fd, "email"),
        kakao_display_name: str(fd, "kakao_display_name"),
        is_primary: bool(fd, "is_primary"),
        is_resigned: bool(fd, "is_resigned"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "저장 완료" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateContactAction(
  id: string,
  clientId: string,
): Promise<ActionResult> {
  try {
    await deactivateContact(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "담당자를 삭제(비활성화)했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── 주소록 ───────────────────────────────────────────────────────────
export async function createAddressAction(
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const label = str(fd, "label");
    if (!label) return { ok: false, message: "주소 별칭을 입력하세요." };
    await createAddress(
      clientId,
      {
        label,
        address_category: str(fd, "address_category"),
        address: str(fd, "address"),
        address_detail: str(fd, "address_detail"),
        usage_type: (str(fd, "usage_type") as AddressUsage) ?? "both",
        is_default_destination: bool(fd, "is_default_destination"),
        verify_status: str(fd, "verify_status"),
        contact_name: str(fd, "contact_name"),
        contact_phone: str(fd, "contact_phone"),
        road_address: str(fd, "road_address"),
        jibun_address: str(fd, "jibun_address"),
        pricing_area: str(fd, "pricing_area"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "주소 추가 완료" };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}

export async function updateAddressAction(
  id: string,
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const label = str(fd, "label");
    if (!label) return { ok: false, message: "주소 별칭을 입력하세요." };
    await updateAddress(
      id,
      {
        label,
        address_category: str(fd, "address_category"),
        address: str(fd, "address"),
        address_detail: str(fd, "address_detail"),
        usage_type: (str(fd, "usage_type") as AddressUsage) ?? "both",
        is_default_destination: bool(fd, "is_default_destination"),
        verify_status: str(fd, "verify_status"),
        contact_name: str(fd, "contact_name"),
        contact_phone: str(fd, "contact_phone"),
        road_address: str(fd, "road_address"),
        jibun_address: str(fd, "jibun_address"),
        pricing_area: str(fd, "pricing_area"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "저장 완료" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateAddressAction(
  id: string,
  clientId: string,
): Promise<ActionResult> {
  try {
    await deactivateAddress(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "주소를 삭제(비활성화)했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── AI 매칭후보 ──────────────────────────────────────────────────────
export async function generateMatchesAction(
  conversationId: string,
): Promise<ActionResult> {
  try {
    await generateMatches(conversationId, await actor());
    revalidatePath(`/chatlogs/${conversationId}`);
    revalidatePath("/clients");
    return { ok: true, message: "거래처 매칭 후보를 생성했습니다." };
  } catch (e) {
    return { ok: false, message: `매칭 실패: ${(e as Error).message}` };
  }
}

export async function confirmCandidateMatchAction(
  id: string,
): Promise<ActionResult> {
  try {
    await confirmCandidateMatch(id, await actor());
    revalidatePath("/clients");
    return { ok: true, message: "기존 데이터에 연결했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

export async function saveCandidateAsNewAction(
  id: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await saveCandidateAsNew(
      id,
      { clientId: str(fd, "clientId"), label: str(fd, "label") },
      await actor(),
    );
    revalidatePath("/clients");
    return { ok: true, message: "주소록/거래처에 저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function rejectCandidateAction(id: string): Promise<ActionResult> {
  try {
    await rejectCandidate(id, await actor());
    revalidatePath("/clients");
    return { ok: true, message: "후보를 무시했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── 운임/요금 정책 ───────────────────────────────────────────────────
export async function savePricingAction(clientId: string, fd: FormData): Promise<ActionResult> {
  try {
    const vehicle_rates: Record<string, number> = {};
    for (const t of VEHICLE_TYPES) {
      const v = num(fd, `vr_${t}`);
      if (v != null) vehicle_rates[t] = v;
    }
    const input: PricingInput = {
      base_fare: num(fd, "base_fare"),
      discount_rate: num(fd, "discount_rate"),
      via_same_gu: num(fd, "via_same_gu"),
      via_other_gu: num(fd, "via_other_gu"),
      via_other_city: num(fd, "via_other_city"),
      night_surcharge: num(fd, "night_surcharge"),
      holiday_surcharge: num(fd, "holiday_surcharge"),
      dispatch_surcharge: num(fd, "dispatch_surcharge"),
      dispatch_surcharge_approval: bool(fd, "dispatch_surcharge_approval"),
      load_fee: num(fd, "load_fee"),
      unload_fee: num(fd, "unload_fee"),
      wait_fee: num(fd, "wait_fee"),
      parking_fee: num(fd, "parking_fee"),
      toll_included: bool(fd, "toll_included"),
      special_surcharge_note: str(fd, "special_surcharge_note"),
      vehicle_rates,
      exceptions: str(fd, "exceptions"),
      notes: str(fd, "notes"),
    };
    await savePricingPolicy(clientId, input, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "운임 정책을 저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

// ── AI 업무규칙 ───────────────────────────────────────────────────────
function parseRule(fd: FormData): RuleInput {
  return {
    name: str(fd, "name") ?? "",
    rule_type: str(fd, "rule_type"),
    condition: str(fd, "condition"),
    content: str(fd, "content"),
    example: str(fd, "example"),
    priority: num(fd, "priority") ?? 0,
    is_enabled: bool(fd, "is_enabled"),
    needs_review: bool(fd, "needs_review"),
  };
}

export async function createRuleAction(clientId: string, fd: FormData): Promise<ActionResult> {
  try {
    const input = parseRule(fd);
    if (!input.name) return { ok: false, message: "규칙명을 입력하세요." };
    await createRule(clientId, input, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "업무규칙을 추가했습니다." };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}

export async function updateRuleAction(id: string, clientId: string, fd: FormData): Promise<ActionResult> {
  try {
    const input = parseRule(fd);
    if (!input.name) return { ok: false, message: "규칙명을 입력하세요." };
    await updateRule(id, input, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateRuleAction(id: string, clientId: string): Promise<ActionResult> {
  try {
    await deactivateRule(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "규칙을 삭제했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── 배차이력 ─────────────────────────────────────────────────────────
export async function createDispatchAction(clientId: string, fd: FormData): Promise<ActionResult> {
  try {
    await createDispatch(clientId, {
      received_on: str(fd, "received_on"),
      origin: str(fd, "origin"),
      destination: str(fd, "destination"),
      vehicle_type: str(fd, "vehicle_type"),
      driver_name: str(fd, "driver_name"),
      charge_amount: num(fd, "charge_amount"),
      driver_fee: num(fd, "driver_fee"),
      dispatch_surcharge: num(fd, "dispatch_surcharge"),
      via_fee: num(fd, "via_fee"),
      status: str(fd, "status"),
      memo: str(fd, "memo"),
    }, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "배차 이력을 추가했습니다." };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}
export async function deactivateDispatchAction(id: string, clientId: string): Promise<ActionResult> {
  try {
    await deactivateDispatch(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "삭제했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── 정산이력 ─────────────────────────────────────────────────────────
export async function createSettlementAction(clientId: string, fd: FormData): Promise<ActionResult> {
  try {
    await createSettlement(clientId, {
      close_month: str(fd, "close_month"),
      total_charge: num(fd, "total_charge"),
      total_driver_fee: num(fd, "total_driver_fee"),
      commission: num(fd, "commission"),
      discount_amount: num(fd, "discount_amount"),
      tax_invoice_issued: bool(fd, "tax_invoice_issued"),
      paid: bool(fd, "paid"),
      unpaid_amount: num(fd, "unpaid_amount"),
      memo: str(fd, "memo"),
    }, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "정산 이력을 추가했습니다." };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}
export async function deactivateSettlementAction(id: string, clientId: string): Promise<ActionResult> {
  try {
    await deactivateSettlement(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "삭제했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── 문서관리 ─────────────────────────────────────────────────────────
export async function uploadDocumentAction(clientId: string, fd: FormData): Promise<ActionResult> {
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "파일을 선택하세요." };
    const docType = str(fd, "doc_type") ?? "기타";
    if (!(DOC_TYPES as readonly string[]).includes(docType)) return { ok: false, message: "문서 유형이 올바르지 않습니다." };
    const buffer = Buffer.from(await file.arrayBuffer());
    await createDocument(clientId, {
      docType,
      filename: file.name,
      buffer,
      mime: file.type || "application/octet-stream",
      memo: str(fd, "memo"),
    }, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: `'${file.name}' 업로드 완료` };
  } catch (e) {
    return { ok: false, message: `업로드 실패: ${(e as Error).message}` };
  }
}
export async function deactivateDocumentAction(id: string, clientId: string): Promise<ActionResult> {
  try {
    await deactivateDocument(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "삭제했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── ⑦ 거래처 지식베이스 ─────────────────────────────────────────────
export async function buildClientKnowledgeAction(clientId: string): Promise<ActionResult> {
  try {
    const k = await buildClientKnowledge(clientId, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: `지식베이스 구축 완료 — 상담 ${k.total.toLocaleString()}건 집계` };
  } catch (e) {
    return { ok: false, message: `구축 실패: ${(e as Error).message}` };
  }
}

// 지식베이스의 자주 쓰는 출발/도착지를 주소록에 추가(거래처 주소록 자동 보강).
export async function addAddressFromKnowledgeAction(
  clientId: string,
  label: string,
  address: string,
  usage: AddressUsage,
): Promise<ActionResult> {
  try {
    if (!address.trim()) return { ok: false, message: "주소가 비어 있습니다." };
    await createAddress(
      clientId,
      { label: label.trim() || address.trim(), address: address.trim(), usage_type: usage },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "주소록에 추가했습니다." };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}
