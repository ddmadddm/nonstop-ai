// 추출된 출발지/도착지의 주소 변환(신/구/가격표 기준 지역) — 저장·조회 계층.
//   순서: ① 거래처 주소록(client_addresses)에 변환정보가 있으면 우선 사용(고신뢰)
//         ② 없으면 AI 어댑터(getAddressResolver)로 추정.
//   신뢰도가 임계 미만이거나 불완전이면 status='needs_review'(직원 확인 필요).
import { sql, resolveAgentId } from "./client";
import {
  getAddressResolver,
  isAddressResolverConfigured,
  type ResolvedAddress,
  type AddressKind,
} from "@/lib/address/resolver";

// 이 미만이면 '직원 확인 필요'.
const REVIEW_THRESHOLD = 0.6;

export type ConversionStatus = "pending" | "resolved" | "needs_review" | "failed";

export interface SideAddress {
  raw: string | null;
  kind: AddressKind | null;
  road_address: string | null;
  jibun_address: string | null;
  pricing_area: string | null;
}
export interface ExtractionAddresses {
  origin: SideAddress;
  destination: SideAddress;
  status: ConversionStatus | null;
  confidence: number | null;
}

type Row = Record<string, unknown>;
function toAddresses(r: Row): ExtractionAddresses {
  const s = (k: string) => (r[k] as string) ?? null;
  return {
    origin: {
      raw: s("origin_raw") ?? s("origin"),
      kind: (r.origin_address_kind as AddressKind) ?? null,
      road_address: s("origin_road_address"),
      jibun_address: s("origin_jibun_address"),
      pricing_area: s("origin_pricing_area"),
    },
    destination: {
      raw: s("destination_raw") ?? s("destination"),
      kind: (r.destination_address_kind as AddressKind) ?? null,
      road_address: s("destination_road_address"),
      jibun_address: s("destination_jibun_address"),
      pricing_area: s("destination_pricing_area"),
    },
    status: (r.address_conversion_status as ConversionStatus) ?? null,
    confidence: r.address_conversion_confidence != null ? Number(r.address_conversion_confidence) : null,
  };
}

export async function getExtractionAddresses(
  conversationId: string,
): Promise<ExtractionAddresses | null> {
  const [r] = await sql<Row[]>`
    select origin, destination,
           origin_raw, origin_address_kind, origin_road_address, origin_jibun_address, origin_pricing_area,
           destination_raw, destination_address_kind, destination_road_address, destination_jibun_address, destination_pricing_area,
           address_conversion_status, address_conversion_confidence
    from conversation_extractions
    where conversation_id = ${conversationId} and is_active`;
  return r ? toAddresses(r) : null;
}

// 거래처 주소록에서 동일/유사 주소의 변환정보를 찾는다(가격표 기준 지역이 채워진 행 우선).
async function addressBookLookup(raw: string): Promise<ResolvedAddress | null> {
  const q = raw.trim();
  if (q.length < 2) return null;
  const [hit] = await sql<
    { road_address: string | null; jibun_address: string | null; pricing_area: string | null; score: number }[]
  >`
    select road_address, jibun_address, pricing_area,
           greatest(
             similarity(coalesce(address,''), ${q}),
             similarity(coalesce(road_address,''), ${q}),
             similarity(coalesce(jibun_address,''), ${q}),
             similarity(coalesce(label,''), ${q})
           ) as score
    from client_addresses
    where is_active and pricing_area is not null
    order by score desc limit 1`;
  if (!hit || hit.score < 0.45) return null;
  return {
    raw,
    kind: "road",
    road_address: hit.road_address,
    jibun_address: hit.jibun_address,
    pricing_area: hit.pricing_area,
    confidence: Math.min(1, 0.7 + hit.score * 0.3), // 주소록 일치는 고신뢰
    source: "addressbook",
  };
}

function toSide(raw: string | null, r: ResolvedAddress | null): SideAddress {
  return {
    raw: raw ?? null,
    kind: r?.kind ?? null,
    road_address: r?.road_address ?? null,
    jibun_address: r?.jibun_address ?? null,
    pricing_area: r?.pricing_area ?? null,
  };
}

// 두 원문 주소를 변환해 ExtractionAddresses 형태로 반환(DB 저장 없음).
//   논사원 답변 등 conversation_extractions 가 아닌 곳에서도 재사용.
export async function resolveAddressPair(
  originRaw: string | null,
  destRaw: string | null,
): Promise<ExtractionAddresses | null> {
  if (!originRaw && !destRaw) return null;
  const [o, d] = await Promise.all([resolveOne(originRaw), resolveOne(destRaw)]);
  const sides = [o, d].filter(Boolean) as ResolvedAddress[];
  const confs = sides.map((s) => s.confidence);
  const minConf = confs.length ? Math.min(...confs) : null;
  const needsReview = sides.some((s) => s.confidence < REVIEW_THRESHOLD || s.kind === "incomplete");
  return {
    origin: toSide(originRaw, o),
    destination: toSide(destRaw, d),
    status: needsReview ? "needs_review" : "resolved",
    confidence: minConf,
  };
}

async function resolveOne(raw: string | null): Promise<ResolvedAddress | null> {
  if (!raw || !raw.trim()) return null;
  const book = await addressBookLookup(raw);
  if (book) return book;
  if (!isAddressResolverConfigured()) {
    // 변환기 미설정 → 원문만 보관, 직원 확인 필요(저신뢰).
    return { raw, kind: "incomplete", road_address: null, jibun_address: null, pricing_area: null, confidence: 0, source: "none" };
  }
  try {
    return await getAddressResolver().resolve(raw);
  } catch {
    return { raw, kind: "incomplete", road_address: null, jibun_address: null, pricing_area: null, confidence: 0, source: "none" };
  }
}

export interface ResolveResult {
  ok: boolean;
  message: string;
  addresses?: ExtractionAddresses;
}

// 추출 결과의 출발지/도착지를 변환해 저장. (best-effort: 한쪽만 있어도 진행)
export async function resolveAndSaveExtractionAddresses(
  conversationId: string,
  byName?: string,
): Promise<ResolveResult> {
  const by = await resolveAgentId(byName);
  const [ex] = await sql<{ origin: string | null; destination: string | null }[]>`
    select origin, destination from conversation_extractions
    where conversation_id = ${conversationId} and is_active`;
  if (!ex) return { ok: false, message: "추출 결과가 없습니다. 먼저 AI 추출을 실행하세요." };
  if (!ex.origin && !ex.destination) {
    return { ok: false, message: "변환할 출발지/도착지가 없습니다." };
  }

  const [o, d] = await Promise.all([resolveOne(ex.origin), resolveOne(ex.destination)]);

  // 상태/신뢰도 — 변환 대상이 있는 쪽들의 최저 신뢰도 기준.
  const sides = [o, d].filter(Boolean) as ResolvedAddress[];
  const confs = sides.map((s) => s.confidence);
  const minConf = confs.length ? Math.min(...confs) : null;
  const needsReview = sides.some((s) => s.confidence < REVIEW_THRESHOLD || s.kind === "incomplete");
  const status: ConversionStatus = needsReview ? "needs_review" : "resolved";

  await sql`
    update conversation_extractions set
      origin_raw            = ${ex.origin},
      origin_address_kind   = ${o?.kind ?? null},
      origin_road_address   = ${o?.road_address ?? null},
      origin_jibun_address  = ${o?.jibun_address ?? null},
      origin_pricing_area   = ${o?.pricing_area ?? null},
      destination_raw           = ${ex.destination},
      destination_address_kind  = ${d?.kind ?? null},
      destination_road_address  = ${d?.road_address ?? null},
      destination_jibun_address = ${d?.jibun_address ?? null},
      destination_pricing_area  = ${d?.pricing_area ?? null},
      address_conversion_status = ${status},
      address_conversion_confidence = ${minConf},
      updated_by = ${by}
    where conversation_id = ${conversationId} and is_active`;

  const saved = await getExtractionAddresses(conversationId);
  return {
    ok: true,
    message: status === "needs_review" ? "변환 완료(직원 확인 필요)" : "주소 변환 완료",
    addresses: saved ?? undefined,
  };
}
