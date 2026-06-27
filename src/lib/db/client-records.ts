// 거래처 배차이력 / 정산이력 / 문서관리 데이터 계층(4단계).
//   향후 인성 프로그램·엑셀 업로드·정산 자동화와 연결할 수 있는 구조.
//   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit 자동 기록.
import { createHash } from "node:crypto";
import { sql, resolveAgentId } from "./client";
import { saveOriginalFile } from "@/lib/storage";

// ── 배차이력 ──────────────────────────────────────────────────────────
export interface DispatchHistory {
  id: string;
  received_on: string | null;
  origin: string | null;
  destination: string | null;
  vehicle_type: string | null;
  driver_name: string | null;
  charge_amount: number | null;
  driver_fee: number | null;
  margin: number | null;
  dispatch_surcharge: number | null;
  via_fee: number | null;
  status: string | null;
  source: string;
  memo: string | null;
}
const numOf = (v: unknown) => (v != null ? Number(v) : null);

export async function listDispatches(clientId: string): Promise<DispatchHistory[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, received_on, origin, destination, vehicle_type, driver_name,
           charge_amount, driver_fee, margin, dispatch_surcharge, via_fee, status, source, memo
    from client_dispatch_histories
    where client_id=${clientId} and is_active
    order by received_on desc nulls last, created_at desc`;
  return rows.map((r) => ({
    id: r.id as string,
    received_on: r.received_on ? (r.received_on as Date).toISOString().slice(0, 10) : null,
    origin: (r.origin as string) ?? null,
    destination: (r.destination as string) ?? null,
    vehicle_type: (r.vehicle_type as string) ?? null,
    driver_name: (r.driver_name as string) ?? null,
    charge_amount: numOf(r.charge_amount),
    driver_fee: numOf(r.driver_fee),
    margin: numOf(r.margin),
    dispatch_surcharge: numOf(r.dispatch_surcharge),
    via_fee: numOf(r.via_fee),
    status: (r.status as string) ?? null,
    source: r.source as string,
    memo: (r.memo as string) ?? null,
  }));
}

export interface DispatchInput {
  received_on?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicle_type?: string | null;
  driver_name?: string | null;
  charge_amount?: number | null;
  driver_fee?: number | null;
  dispatch_surcharge?: number | null;
  via_fee?: number | null;
  status?: string | null;
  memo?: string | null;
}
export async function createDispatch(clientId: string, input: DispatchInput, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    insert into client_dispatch_histories
      (client_id, received_on, origin, destination, vehicle_type, driver_name,
       charge_amount, driver_fee, dispatch_surcharge, via_fee, status, memo, created_by, updated_by)
    values
      (${clientId}, ${input.received_on ?? null}, ${input.origin ?? null}, ${input.destination ?? null},
       ${input.vehicle_type ?? null}, ${input.driver_name ?? null}, ${input.charge_amount ?? null},
       ${input.driver_fee ?? null}, ${input.dispatch_surcharge ?? null}, ${input.via_fee ?? null},
       ${input.status ?? null}, ${input.memo ?? null}, ${by}, ${by})`;
}
export async function deactivateDispatch(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('client_dispatch_histories', ${id}, ${by})`;
}

// ── 정산이력 ──────────────────────────────────────────────────────────
export interface Settlement {
  id: string;
  close_month: string | null;
  total_charge: number | null;
  total_driver_fee: number | null;
  commission: number | null;
  discount_amount: number | null;
  tax_invoice_issued: boolean;
  paid: boolean;
  unpaid_amount: number | null;
  memo: string | null;
}
export async function listSettlements(clientId: string): Promise<Settlement[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select id, close_month, total_charge, total_driver_fee, commission, discount_amount,
           tax_invoice_issued, paid, unpaid_amount, memo
    from client_settlements
    where client_id=${clientId} and is_active
    order by close_month desc nulls last, created_at desc`;
  return rows.map((r) => ({
    id: r.id as string,
    close_month: (r.close_month as string) ?? null,
    total_charge: numOf(r.total_charge),
    total_driver_fee: numOf(r.total_driver_fee),
    commission: numOf(r.commission),
    discount_amount: numOf(r.discount_amount),
    tax_invoice_issued: Boolean(r.tax_invoice_issued),
    paid: Boolean(r.paid),
    unpaid_amount: numOf(r.unpaid_amount),
    memo: (r.memo as string) ?? null,
  }));
}
export interface SettlementInput {
  close_month?: string | null;
  total_charge?: number | null;
  total_driver_fee?: number | null;
  commission?: number | null;
  discount_amount?: number | null;
  tax_invoice_issued?: boolean;
  paid?: boolean;
  unpaid_amount?: number | null;
  memo?: string | null;
}
export async function createSettlement(clientId: string, input: SettlementInput, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    insert into client_settlements
      (client_id, close_month, total_charge, total_driver_fee, commission, discount_amount,
       tax_invoice_issued, paid, unpaid_amount, memo, created_by, updated_by)
    values
      (${clientId}, ${input.close_month ?? null}, ${input.total_charge ?? null},
       ${input.total_driver_fee ?? null}, ${input.commission ?? null}, ${input.discount_amount ?? null},
       ${input.tax_invoice_issued ?? false}, ${input.paid ?? false}, ${input.unpaid_amount ?? null},
       ${input.memo ?? null}, ${by}, ${by})`;
}
export async function deactivateSettlement(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('client_settlements', ${id}, ${by})`;
}

// ── 문서관리 ──────────────────────────────────────────────────────────
export interface ClientDocument {
  id: string;
  doc_type: string;
  filename: string;
  byte_size: number | null;
  mime: string | null;
  memo: string | null;
  created_at: string;
}
export async function listDocuments(clientId: string): Promise<ClientDocument[]> {
  const rows = await sql<(Omit<ClientDocument, "created_at" | "byte_size"> & { created_at: Date; byte_size: string | number | null })[]>`
    select id, doc_type, filename, byte_size, mime, memo, created_at
    from client_documents
    where client_id=${clientId} and is_active
    order by created_at desc`;
  return rows.map((r) => ({
    id: r.id,
    doc_type: r.doc_type,
    filename: r.filename,
    byte_size: r.byte_size != null ? Number(r.byte_size) : null,
    mime: r.mime,
    memo: r.memo,
    created_at: r.created_at.toISOString(),
  }));
}

export async function createDocument(
  clientId: string,
  input: { docType: string; filename: string; buffer: Buffer; mime: string; memo?: string | null },
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  const ext = input.filename.split(".").pop()?.toLowerCase() || "bin";
  const hash = createHash("sha256").update(input.buffer).digest("hex");
  const storedPath = await saveOriginalFile(input.buffer, `doc_${hash}`, ext);
  await sql`
    insert into client_documents
      (client_id, doc_type, filename, stored_path, byte_size, mime, memo, created_by, updated_by)
    values
      (${clientId}, ${input.docType}, ${input.filename}, ${storedPath},
       ${input.buffer.byteLength}, ${input.mime}, ${input.memo ?? null}, ${by}, ${by})`;
}

export async function getDocumentFile(
  id: string,
): Promise<{ filename: string; stored_path: string; mime: string | null } | null> {
  const [r] = await sql<{ filename: string; stored_path: string; mime: string | null }[]>`
    select filename, stored_path, mime from client_documents where id=${id} and is_active`;
  return r ?? null;
}

export async function deactivateDocument(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('client_documents', ${id}, ${by})`;
}
