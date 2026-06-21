// 신규 거래처 후보(client_prospects) — 논사원 답변에서 수집된 후보를 정식 거래처로 승격.
//   승격/연결은 기존 거래처 CRUD(createClient/createContact/createAddress)를 재사용 →
//   변경이력은 fn_audit 트리거가 audit_logs 에 자동 기록(요구사항).
import { sql, resolveAgentId } from "./client";
import { createClient, createContact, createAddress } from "./clients";

export interface Prospect {
  id: string;
  name: string | null;
  manager_name: string | null;
  phone: string | null;
  origin: string | null;
  destination: string | null;
  question: string | null;
  status: "new" | "reviewed" | "converted" | "rejected";
  client_id: string | null;
  client_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

type Row = Omit<Prospect, "created_at"> & { created_at: Date };
function map(r: Row): Prospect {
  return { ...r, created_at: r.created_at.toISOString() };
}

const SELECT = sql`
  select p.id, p.name, p.manager_name, p.phone, p.origin, p.destination, p.question,
         p.status, p.client_id, c.name as client_name,
         a.name as created_by_name, p.created_at
  from client_prospects p
  left join clients c on c.id = p.client_id
  left join agents a on a.id = p.created_by`;

export async function listProspects(status = "new"): Promise<Prospect[]> {
  const rows = await sql<Row[]>`
    ${SELECT}
    where p.is_active and p.status = ${status}
    order by p.created_at desc`;
  return rows.map(map);
}

export async function countNewProspects(): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from client_prospects where is_active and status='new'`;
  return r?.n ?? 0;
}

export async function getProspect(id: string): Promise<Prospect | null> {
  const rows = await sql<Row[]>`${SELECT} where p.id = ${id} and p.is_active`;
  return rows[0] ? map(rows[0]) : null;
}

// 신규 거래처로 등록 — clients + (담당자) + (출발/도착 주소) 생성 후 후보를 'converted'.
export interface PromoteInput {
  name: string;
  phone?: string | null;
}
export async function promoteProspectToNewClient(
  id: string,
  input: PromoteInput,
  byName?: string,
): Promise<string> {
  const by = await resolveAgentId(byName);
  const p = await getProspect(id);
  if (!p) throw new Error("후보를 찾을 수 없습니다.");
  if (p.status === "converted") throw new Error("이미 처리된 후보입니다.");
  if (!input.name.trim()) throw new Error("거래처명을 입력하세요.");

  const clientId = await createClient(
    { name: input.name.trim(), phone: input.phone ?? p.phone },
    byName,
  );
  await addContactAndAddresses(clientId, p, byName);
  await sql`
    update client_prospects set status='converted', client_id=${clientId}, updated_by=${by}
    where id=${id} and is_active`;
  return clientId;
}

// 기존 거래처에 연결 — 담당자/주소만 추가(요구사항 6). 거래처 본체는 수정하지 않는다.
export async function linkProspectToClient(
  id: string,
  clientId: string,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  const p = await getProspect(id);
  if (!p) throw new Error("후보를 찾을 수 없습니다.");
  if (p.status === "converted") throw new Error("이미 처리된 후보입니다.");
  await addContactAndAddresses(clientId, p, byName);
  await sql`
    update client_prospects set status='converted', client_id=${clientId}, updated_by=${by}
    where id=${id} and is_active`;
}

async function addContactAndAddresses(
  clientId: string,
  p: Prospect,
  byName?: string,
): Promise<void> {
  if (p.manager_name || p.phone) {
    await createContact(
      clientId,
      { name: p.manager_name ?? "담당자", phone: p.phone, is_primary: false },
      byName,
    );
  }
  if (p.origin) {
    await createAddress(
      clientId,
      { label: "출발지", address: p.origin, usage_type: "origin" },
      byName,
    );
  }
  if (p.destination) {
    await createAddress(
      clientId,
      { label: "도착지", address: p.destination, usage_type: "destination" },
      byName,
    );
  }
}

export async function rejectProspect(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update client_prospects set status='rejected', updated_by=${by}
    where id=${id} and is_active and status <> 'converted'`;
}
