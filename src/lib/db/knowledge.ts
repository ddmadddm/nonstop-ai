// ⑦ 거래처 지식베이스 — 분리·추출·매칭 결과를 거래처별로 집계.
//   원본 불변. 파생 집계만 client_knowledge 에 저장(재구축 시 활성본 비활성화 후 재적재).
import { sql, resolveAgentId } from "./client";

export interface KItem {
  value: string;
  count: number;
}
export interface KManager {
  name: string | null;
  phone: string | null;
  count: number;
}
export interface ClientKnowledge {
  origins: KItem[];
  destinations: KItem[];
  vehicles: KItem[];
  managers: KManager[];
  consultation_types: KItem[];
  total: number;
  urgent: number;
  source_count: number | null;
  period_start: string | null;
  period_end: string | null;
  updated_at: string | null;
}

// 거래처에 귀속된 세그먼트 추출의 조건:
//   (a) 그 방(대화)이 이 거래처로 지정됐거나(chat_archive_analysis.client_id)
//   (b) 세그먼트의 client 매칭 후보가 이 거래처로 매칭/확정된 경우.
//   매번 새 프래그먼트를 반환(같은 인스턴스 재사용 회피).
function pred(clientId: string) {
  return sql`
    e.is_active and e.segment_id is not null and (
      e.conversation_id in (
        select conversation_id from chat_archive_analysis where client_id=${clientId} and is_active
      )
      or exists (
        select 1 from client_match_candidates m
        where m.segment_id = e.segment_id and m.is_active and m.field_type='client'
          and (m.resolved_client_id=${clientId} or m.matched_client_id=${clientId})
      )
    )`;
}

export async function buildClientKnowledge(
  clientId: string,
  byName?: string,
): Promise<ClientKnowledge> {
  const by = await resolveAgentId(byName);

  const topText = (col: "origin" | "destination" | "vehicle_type" | "consultation_type") =>
    sql<{ v: string; c: number }[]>`
      select e.${sql(col)} as v, count(*)::int as c
      from conversation_extractions e
      where ${pred(clientId)} and e.${sql(col)} is not null and e.${sql(col)} <> ''
      group by e.${sql(col)} order by c desc, v limit 10`;

  const [origins, destinations, vehicles, consultationTypes, managers, totals, period] =
    await Promise.all([
      topText("origin"),
      topText("destination"),
      topText("vehicle_type"),
      topText("consultation_type"),
      sql<{ name: string | null; phone: string | null; c: number }[]>`
        select e.manager_name as name, e.phone as phone, count(*)::int as c
        from conversation_extractions e
        where ${pred(clientId)} and (e.manager_name is not null or e.phone is not null)
        group by e.manager_name, e.phone order by c desc limit 10`,
      sql<{ total: number; urgent: number }[]>`
        select count(*)::int as total, count(*) filter (where e.is_urgent)::int as urgent
        from conversation_extractions e where ${pred(clientId)}`,
      sql<{ ps: Date | null; pe: Date | null }[]>`
        select min(s.started_at) as ps, max(s.ended_at) as pe
        from conversation_segments s
        join conversation_extractions e on e.segment_id = s.id
        where ${pred(clientId)}`,
    ]);

  const total = totals[0]?.total ?? 0;
  const urgent = totals[0]?.urgent ?? 0;
  const value = {
    origins: origins.map((r) => ({ value: r.v, count: r.c })),
    destinations: destinations.map((r) => ({ value: r.v, count: r.c })),
    vehicles: vehicles.map((r) => ({ value: r.v, count: r.c })),
    consultation_types: consultationTypes.map((r) => ({ value: r.v, count: r.c })),
    managers: managers.map((r) => ({ name: r.name, phone: r.phone, count: r.c })),
    total,
    urgent,
  };

  await sql.begin(async (tx) => {
    await tx`
      update client_knowledge
      set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
      where client_id=${clientId} and kind='summary' and is_active`;
    await tx`
      insert into client_knowledge
        (client_id, kind, value, source_count, period_start, period_end, created_by, updated_by)
      values
        (${clientId}, 'summary', ${tx.json(value)}, ${total},
         ${period[0]?.ps ?? null}, ${period[0]?.pe ?? null}, ${by}, ${by})`;
  });

  // 이 거래처로 지정된 대형 채팅방들을 'AI학습완료'로 표시(라이프사이클 완료).
  await sql`
    update consultation_materials set archive_status='learned', updated_by=${by}
    where is_active and is_archive
      and conversation_id in (
        select conversation_id from chat_archive_analysis where client_id=${clientId} and is_active
      )`;

  return (await getClientKnowledge(clientId))!;
}

export async function getClientKnowledge(clientId: string): Promise<ClientKnowledge | null> {
  const rows = await sql<
    {
      value: Omit<ClientKnowledge, "source_count" | "period_start" | "period_end" | "updated_at">;
      source_count: number | null;
      period_start: Date | null;
      period_end: Date | null;
      updated_at: Date;
    }[]
  >`
    select value, source_count, period_start, period_end, updated_at
    from client_knowledge
    where client_id=${clientId} and kind='summary' and is_active`;
  const r = rows[0];
  if (!r) return null;
  return {
    origins: r.value.origins ?? [],
    destinations: r.value.destinations ?? [],
    vehicles: r.value.vehicles ?? [],
    managers: r.value.managers ?? [],
    consultation_types: r.value.consultation_types ?? [],
    total: r.value.total ?? 0,
    urgent: r.value.urgent ?? 0,
    source_count: r.source_count,
    period_start: r.period_start ? r.period_start.toISOString() : null,
    period_end: r.period_end ? r.period_end.toISOString() : null,
    updated_at: r.updated_at.toISOString(),
  };
}
