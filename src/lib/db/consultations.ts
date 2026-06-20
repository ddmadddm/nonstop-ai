// consultations 테이블 접근 계층 (기존 src/lib/store.ts 의 JSON 구현을 대체).
// 인터페이스(필드명)는 화면 호환을 위해 기존 Consultation 형태를 유지한다.
import { sql, resolveAgentId } from "./client";

// 화면이 의존하는 형태(기존 store.ts 와 동일 필드명 유지)
export interface Consultation {
  id: string;
  client_name?: string;
  manager_name?: string;
  consultation_type?: string;
  consultation_content_original?: string; // = DB content_original
  image_urls: string[];
  created_by?: string; // 등록자 이름(agents.name)
  created_at: string; // ISO
  updated_at: string; // ISO
}

export interface NewConsultation {
  client_name?: string;
  manager_name?: string;
  consultation_type?: string;
  consultation_content_original?: string;
  image_urls: string[];
  created_by?: string; // 등록자 이름
}

type Row = {
  id: string;
  client_name: string | null;
  manager_name: string | null;
  consultation_type: string | null;
  content_original: string | null;
  image_urls: string[] | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
};

function map(r: Row): Consultation {
  return {
    id: r.id,
    client_name: r.client_name ?? undefined,
    manager_name: r.manager_name ?? undefined,
    consultation_type: r.consultation_type ?? undefined,
    consultation_content_original: r.content_original ?? undefined,
    image_urls: r.image_urls ?? [],
    created_by: r.created_by_name ?? undefined,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

export async function getConsultations(): Promise<Consultation[]> {
  const rows = await sql<Row[]>`
    select c.id, c.client_name, c.manager_name, c.consultation_type,
           c.content_original, c.image_urls,
           a.name as created_by_name, c.created_at, c.updated_at
    from consultations c
    left join agents a on a.id = c.created_by
    where c.is_active
    order by c.created_at desc`;
  return rows.map(map);
}

export async function getConsultation(id: string): Promise<Consultation | null> {
  const [r] = await sql<Row[]>`
    select c.id, c.client_name, c.manager_name, c.consultation_type,
           c.content_original, c.image_urls,
           a.name as created_by_name, c.created_at, c.updated_at
    from consultations c
    left join agents a on a.id = c.created_by
    where c.id = ${id}`;
  return r ? map(r) : null;
}

export async function getConsultationCount(): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from consultations where is_active`;
  return r.n;
}

export async function addConsultation(input: NewConsultation): Promise<string> {
  const by = await resolveAgentId(input.created_by);
  const [r] = await sql<{ id: string }[]>`
    insert into consultations
      (client_name, manager_name, consultation_type, content_original,
       image_urls, created_by, updated_by)
    values
      (${input.client_name ?? null}, ${input.manager_name ?? null},
       ${input.consultation_type ?? null}, ${input.consultation_content_original ?? null},
       ${input.image_urls}, ${by}, ${by})
    returning id`;
  return r.id;
}

// "삭제" 대신 비활성화(④). fn_block_delete 트리거가 물리삭제를 차단한다.
export async function deactivateConsultation(
  id: string,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`select fn_deactivate('consultations'::regclass, ${id}::uuid, ${by}::uuid)`;
}
