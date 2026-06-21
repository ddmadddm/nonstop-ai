// 거래처(주거래처) 마스터 접근 계층 — 거래처 + 담당자 + 주소록 + AI 매칭후보.
//   원칙: 물리삭제 금지(is_active=false) · 변경이력은 fn_audit 트리거가 자동 기록.
import { sql, resolveAgentId } from "./client";

// ── 타입 ─────────────────────────────────────────────────────────────
export interface Client {
  id: string;
  name: string;
  business_no: string | null;
  phone: string | null;
  default_payment_method: string | null;
  default_vehicle_type: string | null;
  frequent_vehicle_types: string[];
  fare_terms: string | null;
  memo: string | null;
  default_origin_address_id: string | null;
  default_origin_label: string | null;
}

export interface ClientListItem {
  id: string;
  name: string;
  business_no: string | null;
  phone: string | null;
  default_payment_method: string | null;
  default_vehicle_type: string | null;
  memo: string | null;
  contact_count: number;
  address_count: number;
}

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  memo: string | null;
}

export type AddressUsage = "origin" | "destination" | "both";

export interface ClientAddress {
  id: string;
  client_id: string;
  label: string;
  address: string | null;
  address_detail: string | null;
  usage_type: AddressUsage;
  contact_name: string | null;
  contact_phone: string | null;
  memo: string | null;
}

export type MatchFieldType = "client" | "contact" | "origin" | "destination";
export type MatchType = "exact" | "similar" | "new";
export type MatchStatus = "pending" | "confirmed" | "rejected";

export interface MatchCandidate {
  id: string;
  conversation_id: string;
  conversation_title: string | null;
  field_type: MatchFieldType;
  extracted_value: string | null;
  extracted_phone: string | null;
  matched_client_id: string | null;
  matched_client_name: string | null;
  matched_contact_id: string | null;
  matched_contact_name: string | null;
  matched_address_id: string | null;
  matched_address_label: string | null;
  match_score: number | null;
  match_type: MatchType;
  status: MatchStatus;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

// 매칭 임계값: 이 이상이면 "유사" 추천, 미만이면 "신규" 후보.
//   한글 트라이그램 유사도는 짧은 상호에서 낮게 나오므로(예: '하림물류'↔'하림'≈0.33)
//   재현율을 위해 낮게 잡는다. 어차피 직원이 확인 후 저장하므로 과추천이 안전하다.
const SIMILAR_THRESHOLD = 0.3;
const EXACT_THRESHOLD = 0.95;
// 세그먼트 미지정(대화 단위) 후보를 유일 인덱스에서 정규화하는 제로 UUID.
const NULL_SEGMENT = "00000000-0000-0000-0000-000000000000";

// ── 거래처 CRUD ──────────────────────────────────────────────────────
export async function listClients(): Promise<ClientListItem[]> {
  return sql<ClientListItem[]>`
    select c.id, c.name, c.business_no, c.phone,
           c.default_payment_method, c.default_vehicle_type, c.memo,
           (select count(*)::int from client_contacts cc
              where cc.client_id = c.id and cc.is_active) as contact_count,
           (select count(*)::int from client_addresses a
              where a.client_id = c.id and a.is_active) as address_count
    from clients c
    where c.is_active
    order by c.name`;
}

// 거래처 검색 — 거래처명/담당자명/연락처로 매칭(논사원 주거래처 선택용)
export interface ClientSearchHit {
  id: string;
  name: string;
  phone: string | null;
  contacts: string | null;
}
export async function searchClients(query: string): Promise<ClientSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const digits = q.replace(/[^0-9]/g, "");
  return sql<ClientSearchHit[]>`
    select c.id, c.name, c.phone,
           (select string_agg(distinct ct.name, ', ')
              from client_contacts ct where ct.client_id=c.id and ct.is_active) as contacts
    from clients c
    where c.is_active and (
      c.name ilike ${like}
      or (c.phone is not null and ${digits} <> '' and regexp_replace(c.phone,'[^0-9]','','g') ilike ${"%" + digits + "%"})
      or exists (
        select 1 from client_contacts ct
        where ct.client_id=c.id and ct.is_active and (
          ct.name ilike ${like}
          or (ct.phone is not null and ${digits} <> '' and regexp_replace(ct.phone,'[^0-9]','','g') ilike ${"%" + digits + "%"})
        )
      )
    )
    order by c.name
    limit 10`;
}

export async function getClient(id: string): Promise<Client | null> {
  const rows = await sql<Client[]>`
    select c.id, c.name, c.business_no, c.phone,
           c.default_payment_method, c.default_vehicle_type,
           c.frequent_vehicle_types, c.fare_terms, c.memo,
           c.default_origin_address_id, a.label as default_origin_label
    from clients c
    left join client_addresses a on a.id = c.default_origin_address_id
    where c.id = ${id} and c.is_active`;
  return rows[0] ?? null;
}

export interface ClientInput {
  name: string;
  business_no?: string | null;
  phone?: string | null;
  default_payment_method?: string | null;
  default_vehicle_type?: string | null;
  frequent_vehicle_types?: string[];
  fare_terms?: string | null;
  memo?: string | null;
}

export async function createClient(input: ClientInput, byName?: string): Promise<string> {
  const by = await resolveAgentId(byName);
  const [row] = await sql<{ id: string }[]>`
    insert into clients
      (name, business_no, phone, default_payment_method, default_vehicle_type,
       frequent_vehicle_types, fare_terms, memo, created_by, updated_by)
    values
      (${input.name}, ${input.business_no ?? null}, ${input.phone ?? null},
       ${input.default_payment_method ?? null}, ${input.default_vehicle_type ?? null},
       ${input.frequent_vehicle_types ?? []}, ${input.fare_terms ?? null},
       ${input.memo ?? null}, ${by}, ${by})
    returning id`;
  return row.id;
}

export async function updateClient(
  id: string,
  input: ClientInput,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update clients set
      name=${input.name}, business_no=${input.business_no ?? null},
      phone=${input.phone ?? null},
      default_payment_method=${input.default_payment_method ?? null},
      default_vehicle_type=${input.default_vehicle_type ?? null},
      frequent_vehicle_types=${input.frequent_vehicle_types ?? []},
      fare_terms=${input.fare_terms ?? null}, memo=${input.memo ?? null},
      updated_by=${by}
    where id=${id} and is_active`;
}

export async function deactivateClient(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('clients', ${id}, ${by})`;
}

export async function setDefaultOrigin(
  clientId: string,
  addressId: string | null,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update clients set default_origin_address_id=${addressId}, updated_by=${by}
    where id=${clientId} and is_active`;
}

// ── 담당자 ───────────────────────────────────────────────────────────
export async function listContacts(clientId: string): Promise<ClientContact[]> {
  return sql<ClientContact[]>`
    select id, client_id, name, title, phone, email, is_primary, memo
    from client_contacts
    where client_id=${clientId} and is_active
    order by is_primary desc, name`;
}

export interface ContactInput {
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  is_primary?: boolean;
  memo?: string | null;
}

export async function createContact(
  clientId: string,
  input: ContactInput,
  byName?: string,
): Promise<string> {
  const by = await resolveAgentId(byName);
  if (input.is_primary) await clearPrimaryContact(clientId, by);
  const [row] = await sql<{ id: string }[]>`
    insert into client_contacts
      (client_id, name, title, phone, email, is_primary, memo, created_by, updated_by)
    values
      (${clientId}, ${input.name}, ${input.title ?? null}, ${input.phone ?? null},
       ${input.email ?? null}, ${input.is_primary ?? false}, ${input.memo ?? null},
       ${by}, ${by})
    returning id`;
  return row.id;
}

export async function updateContact(
  id: string,
  input: ContactInput,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  const [c] = await sql<{ client_id: string }[]>`
    select client_id from client_contacts where id=${id} and is_active`;
  if (c && input.is_primary) await clearPrimaryContact(c.client_id, by, id);
  await sql`
    update client_contacts set
      name=${input.name}, title=${input.title ?? null}, phone=${input.phone ?? null},
      email=${input.email ?? null}, is_primary=${input.is_primary ?? false},
      memo=${input.memo ?? null}, updated_by=${by}
    where id=${id} and is_active`;
}

export async function deactivateContact(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('client_contacts', ${id}, ${by})`;
}

async function clearPrimaryContact(
  clientId: string,
  by: string | null,
  exceptId?: string,
): Promise<void> {
  await sql`
    update client_contacts set is_primary=false, updated_by=${by}
    where client_id=${clientId} and is_active and is_primary
      and id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}`;
}

// ── 주소록 ───────────────────────────────────────────────────────────
export async function listAddresses(clientId: string): Promise<ClientAddress[]> {
  return sql<ClientAddress[]>`
    select id, client_id, label, address, address_detail, usage_type,
           contact_name, contact_phone, memo
    from client_addresses
    where client_id=${clientId} and is_active
    order by label`;
}

export interface AddressInput {
  label: string;
  address?: string | null;
  address_detail?: string | null;
  usage_type?: AddressUsage;
  contact_name?: string | null;
  contact_phone?: string | null;
  memo?: string | null;
}

export async function createAddress(
  clientId: string,
  input: AddressInput,
  byName?: string,
): Promise<string> {
  const by = await resolveAgentId(byName);
  const [row] = await sql<{ id: string }[]>`
    insert into client_addresses
      (client_id, label, address, address_detail, usage_type,
       contact_name, contact_phone, memo, created_by, updated_by)
    values
      (${clientId}, ${input.label}, ${input.address ?? null},
       ${input.address_detail ?? null}, ${input.usage_type ?? "both"},
       ${input.contact_name ?? null}, ${input.contact_phone ?? null},
       ${input.memo ?? null}, ${by}, ${by})
    returning id`;
  return row.id;
}

export async function updateAddress(
  id: string,
  input: AddressInput,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update client_addresses set
      label=${input.label}, address=${input.address ?? null},
      address_detail=${input.address_detail ?? null},
      usage_type=${input.usage_type ?? "both"},
      contact_name=${input.contact_name ?? null},
      contact_phone=${input.contact_phone ?? null},
      memo=${input.memo ?? null}, updated_by=${by}
    where id=${id} and is_active`;
}

export async function deactivateAddress(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  // 기본 출발지로 지정돼 있으면 해제(FK on delete set null 은 비활성화엔 안 걸림)
  await sql`
    update clients set default_origin_address_id=null
    where default_origin_address_id=${id}`;
  await sql`select fn_deactivate('client_addresses', ${id}, ${by})`;
}

// ── 상담이력(거래처에 연결된 확정 상담) ──────────────────────────────
export interface ClientConsultation {
  conversation_id: string;
  title: string | null;
  client_name: string | null;
  origin: string | null;
  destination: string | null;
  resolved_at: string | null;
}
export async function getClientConsultations(
  clientId: string,
): Promise<ClientConsultation[]> {
  const rows = await sql<(Omit<ClientConsultation, "resolved_at"> & { resolved_at: Date | null })[]>`
    select distinct on (cv.id)
           cv.id as conversation_id, cv.title,
           e.client_name, e.origin, e.destination, m.resolved_at
    from client_match_candidates m
    join conversations cv on cv.id = m.conversation_id
    left join conversation_extractions e
      on e.conversation_id = cv.id and e.is_active
    where m.is_active and m.status='confirmed' and m.field_type='client'
      and (m.resolved_client_id=${clientId} or m.matched_client_id=${clientId})
    order by cv.id, m.resolved_at desc nulls last`;
  return rows.map((r) => ({
    ...r,
    resolved_at: r.resolved_at ? r.resolved_at.toISOString() : null,
  }));
}

// ── AI 매칭후보 ──────────────────────────────────────────────────────
type CandRow = Omit<MatchCandidate, "resolved_at" | "created_at"> & {
  resolved_at: Date | null;
  created_at: Date;
};
function mapCand(r: CandRow): MatchCandidate {
  return {
    ...r,
    resolved_at: r.resolved_at ? r.resolved_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
  };
}
const CAND_SELECT = sql`
  select m.id, m.conversation_id, cv.title as conversation_title,
         m.field_type, m.extracted_value, m.extracted_phone,
         m.matched_client_id, cl.name as matched_client_name,
         m.matched_contact_id, ct.name as matched_contact_name,
         m.matched_address_id, ad.label as matched_address_label,
         m.match_score, m.match_type, m.status,
         ag.name as resolved_by_name, m.resolved_at, m.created_at
  from client_match_candidates m
  left join conversations cv on cv.id = m.conversation_id
  left join clients cl on cl.id = m.matched_client_id
  left join client_contacts ct on ct.id = m.matched_contact_id
  left join client_addresses ad on ad.id = m.matched_address_id
  left join agents ag on ag.id = m.resolved_by`;

// 거래처 상세 "AI 매칭" 탭 — 이 거래처로 추천된 후보(대기 + 최근 처리)
export async function listCandidatesForClient(
  clientId: string,
): Promise<MatchCandidate[]> {
  const rows = await sql<CandRow[]>`
    ${CAND_SELECT}
    where m.is_active and m.matched_client_id=${clientId}
    order by (m.status='pending') desc, m.created_at desc`;
  return rows.map(mapCand);
}

// 전역 — 처리 대기중인 모든 후보(목록 화면 상단 배너)
export async function listPendingCandidates(): Promise<MatchCandidate[]> {
  const rows = await sql<CandRow[]>`
    ${CAND_SELECT}
    where m.is_active and m.status='pending'
    order by m.created_at desc`;
  return rows.map(mapCand);
}

// 특정 상담(conversation)의 후보 — 상담자료 화면에서 표시(대화 단위, segment_id 무관)
export async function listCandidatesForConversation(
  conversationId: string,
): Promise<MatchCandidate[]> {
  const rows = await sql<CandRow[]>`
    ${CAND_SELECT}
    where m.is_active and m.conversation_id=${conversationId} and m.segment_id is null
    order by array_position(array['client','contact','origin','destination'], m.field_type)`;
  return rows.map(mapCand);
}

// 특정 세그먼트(상담 단위)의 후보 — 원본 자료실 상세에서 표시
export async function listCandidatesForSegment(
  segmentId: string,
): Promise<MatchCandidate[]> {
  const rows = await sql<CandRow[]>`
    ${CAND_SELECT}
    where m.is_active and m.segment_id=${segmentId}
    order by array_position(array['client','contact','origin','destination'], m.field_type)`;
  return rows.map(mapCand);
}

// 추출 결과(거래처명/담당자/연락처/출발지/도착지)를 기존 데이터와 매칭 → 후보 생성/갱신.
//   segmentId 지정 시 해당 상담 단위의 추출/후보를 대상으로 한다(⑥).
export async function generateMatches(
  conversationId: string,
  byName?: string,
  segmentId: string | null = null,
): Promise<MatchCandidate[]> {
  const by = await resolveAgentId(byName);
  const [ex] = await sql<
    {
      client_name: string | null;
      manager_name: string | null;
      phone: string | null;
      origin: string | null;
      destination: string | null;
    }[]
  >`
    select client_name, manager_name, phone, origin, destination
    from conversation_extractions
    where conversation_id=${conversationId} and is_active
      and segment_id is not distinct from ${segmentId}`;
  if (!ex) throw new Error("추출 결과가 없습니다. 먼저 AI 추출을 실행하세요.");

  // 1) 거래처 매칭(이름 유사도)
  let matchedClientId: string | null = null;
  if (ex.client_name) {
    const [best] = await sql<{ id: string; score: number }[]>`
      select id, similarity(name, ${ex.client_name}) as score
      from clients where is_active
      order by score desc limit 1`;
    const score = best?.score ?? 0;
    if (best && score >= SIMILAR_THRESHOLD) matchedClientId = best.id;
    await upsertCandidate(conversationId, segmentId, "client", {
      extracted_value: ex.client_name,
      matched_client_id: matchedClientId,
      match_score: best?.score ?? null,
      match_type: classify(score),
      by,
    });
  }

  // 2) 담당자 매칭(이름/연락처) — 매칭된 거래처 범위 내
  if (ex.manager_name || ex.phone) {
    let contactId: string | null = null;
    let cscore = 0;
    if (matchedClientId) {
      const [best] = await sql<{ id: string; score: number }[]>`
        select id, greatest(
                 similarity(coalesce(name,''), ${ex.manager_name ?? ""}),
                 similarity(coalesce(phone,''), ${ex.phone ?? ""})
               ) as score
        from client_contacts
        where client_id=${matchedClientId} and is_active
        order by score desc limit 1`;
      cscore = best?.score ?? 0;
      if (best && cscore >= SIMILAR_THRESHOLD) contactId = best.id;
    }
    await upsertCandidate(conversationId, segmentId, "contact", {
      extracted_value: ex.manager_name,
      extracted_phone: ex.phone,
      matched_client_id: matchedClientId,
      matched_contact_id: contactId,
      match_score: cscore || null,
      match_type: classify(cscore),
      by,
    });
  }

  // 3) 출발지/도착지 매칭(주소/별칭 유사도) — 매칭된 거래처 범위 내
  await matchAddress(conversationId, segmentId, "origin", ex.origin, matchedClientId, by);
  await matchAddress(conversationId, segmentId, "destination", ex.destination, matchedClientId, by);

  return segmentId
    ? listCandidatesForSegment(segmentId)
    : listCandidatesForConversation(conversationId);
}

async function matchAddress(
  conversationId: string,
  segmentId: string | null,
  field: "origin" | "destination",
  value: string | null,
  clientId: string | null,
  by: string | null,
): Promise<void> {
  if (!value) return;
  const usage = field === "origin" ? "origin" : "destination";
  let addressId: string | null = null;
  let score = 0;
  if (clientId) {
    const [best] = await sql<{ id: string; score: number }[]>`
      select id, greatest(
               similarity(coalesce(address,''), ${value}),
               similarity(coalesce(label,''), ${value})
             ) as score
      from client_addresses
      where client_id=${clientId} and is_active
        and usage_type in (${usage}, 'both')
      order by score desc limit 1`;
    score = best?.score ?? 0;
    if (best && score >= SIMILAR_THRESHOLD) addressId = best.id;
  }
  await upsertCandidate(conversationId, segmentId, field, {
    extracted_value: value,
    matched_client_id: clientId,
    matched_address_id: addressId,
    match_score: score || null,
    match_type: classify(score),
    by,
  });
}

function classify(score: number): MatchType {
  if (score >= EXACT_THRESHOLD) return "exact";
  if (score >= SIMILAR_THRESHOLD) return "similar";
  return "new";
}

interface UpsertFields {
  extracted_value?: string | null;
  extracted_phone?: string | null;
  matched_client_id?: string | null;
  matched_contact_id?: string | null;
  matched_address_id?: string | null;
  match_score: number | null;
  match_type: MatchType;
  by: string | null;
}
// 대화(또는 세그먼트)×후보종류 당 1건. 이미 직원이 처리(confirmed/rejected)한 후보는 덮어쓰지 않는다.
async function upsertCandidate(
  conversationId: string,
  segmentId: string | null,
  fieldType: MatchFieldType,
  f: UpsertFields,
): Promise<void> {
  await sql`
    insert into client_match_candidates
      (conversation_id, segment_id, field_type, extracted_value, extracted_phone,
       matched_client_id, matched_contact_id, matched_address_id,
       match_score, match_type, created_by, updated_by)
    values
      (${conversationId}, ${segmentId}, ${fieldType}, ${f.extracted_value ?? null},
       ${f.extracted_phone ?? null}, ${f.matched_client_id ?? null},
       ${f.matched_contact_id ?? null}, ${f.matched_address_id ?? null},
       ${f.match_score}, ${f.match_type}, ${f.by}, ${f.by})
    on conflict (conversation_id, coalesce(segment_id, ${NULL_SEGMENT}::uuid), field_type) where is_active
    do update set
      extracted_value=excluded.extracted_value,
      extracted_phone=excluded.extracted_phone,
      matched_client_id=excluded.matched_client_id,
      matched_contact_id=excluded.matched_contact_id,
      matched_address_id=excluded.matched_address_id,
      match_score=excluded.match_score,
      match_type=excluded.match_type,
      updated_by=excluded.updated_by
    where client_match_candidates.status='pending'`;
}

async function getCandidate(id: string) {
  const [c] = await sql<
    {
      id: string;
      field_type: MatchFieldType;
      extracted_value: string | null;
      extracted_phone: string | null;
      matched_client_id: string | null;
      matched_contact_id: string | null;
      matched_address_id: string | null;
    }[]
  >`
    select id, field_type, extracted_value, extracted_phone,
           matched_client_id, matched_contact_id, matched_address_id
    from client_match_candidates where id=${id} and is_active and status='pending'`;
  return c ?? null;
}

// 추천 매칭 그대로 확정(기존 거래처/담당자/주소에 연결).
export async function confirmCandidateMatch(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  const c = await getCandidate(id);
  if (!c) throw new Error("처리할 후보가 없습니다.");
  if (!c.matched_client_id && !c.matched_contact_id && !c.matched_address_id)
    throw new Error("매칭된 기존 데이터가 없습니다. '신규 저장'을 사용하세요.");
  await sql`
    update client_match_candidates set
      status='confirmed', resolved_by=${by}, resolved_at=now(),
      resolved_client_id=${c.matched_client_id},
      resolved_contact_id=${c.matched_contact_id},
      resolved_address_id=${c.matched_address_id}, updated_by=${by}
    where id=${id} and is_active`;
}

export interface SaveCandidateInput {
  clientId?: string | null;   // 대상 거래처(담당자/주소 신규저장 시)
  label?: string | null;      // 주소 별칭
}
// 신규로 저장 — 거래처/담당자/주소록에 새 레코드 생성 후 확정.
export async function saveCandidateAsNew(
  id: string,
  input: SaveCandidateInput,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  const c = await getCandidate(id);
  if (!c) throw new Error("처리할 후보가 없습니다.");
  if (!c.extracted_value) throw new Error("저장할 값이 없습니다.");

  let resolvedClient: string | null = null;
  let resolvedContact: string | null = null;
  let resolvedAddress: string | null = null;
  const target = input.clientId || c.matched_client_id || null;

  if (c.field_type === "client") {
    resolvedClient = await createClient({ name: c.extracted_value }, byName);
  } else if (c.field_type === "contact") {
    if (!target) throw new Error("담당자를 저장할 거래처를 선택하세요.");
    resolvedClient = target;
    resolvedContact = await createContact(
      target,
      { name: c.extracted_value, phone: c.extracted_phone },
      byName,
    );
  } else {
    // origin | destination
    if (!target) throw new Error("주소를 저장할 거래처를 선택하세요.");
    resolvedClient = target;
    resolvedAddress = await createAddress(
      target,
      {
        label: input.label || c.extracted_value,
        address: c.extracted_value,
        usage_type: c.field_type === "origin" ? "origin" : "destination",
        contact_phone: c.extracted_phone,
      },
      byName,
    );
  }

  await sql`
    update client_match_candidates set
      status='confirmed', resolved_by=${by}, resolved_at=now(),
      resolved_client_id=${resolvedClient},
      resolved_contact_id=${resolvedContact},
      resolved_address_id=${resolvedAddress}, updated_by=${by}
    where id=${id} and is_active`;
}

export async function rejectCandidate(id: string, byName?: string): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update client_match_candidates set
      status='rejected', resolved_by=${by}, resolved_at=now(), updated_by=${by}
    where id=${id} and is_active and status='pending'`;
}
