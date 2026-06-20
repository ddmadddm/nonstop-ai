// PostgreSQL 연결 (Supabase Postgres) — 표준 SQL 드라이버(postgres.js).
// Supabase에 비종속: DATABASE_URL 만 바꾸면 다른 Postgres로 이전 가능.
// 화면/도메인 코드는 이 sql 핸들을 통해서만 DB에 접근한다.
import postgres, { type Sql } from "postgres";

const g = globalThis as unknown as { __pg__?: Sql };

function init(): Sql {
  if (g.__pg__) return g.__pg__;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL 환경변수가 없습니다. .env.example 을 복사해 .env 를 만들고 " +
        "Supabase 연결 문자열을 채워주세요.",
    );
  }
  // prepare:false → Supabase 트랜잭션 풀러(6543)와 직접연결(5432) 모두에서 안전.
  g.__pg__ = postgres(url, { prepare: false, idle_timeout: 20, max: 10 });
  return g.__pg__;
}

// 지연 초기화 프록시: 빌드 시점에 연결을 만들지 않고, 첫 쿼리에서 초기화한다.
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_t, _thisArg, args) {
    return (init() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_t, prop) {
    const s = init() as unknown as Record<string | symbol, unknown>;
    const v = s[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(s) : v;
  },
});

// 직원 이름 → agents.id (없으면 생성). created_by/검수자 등 매핑용.
export async function resolveAgentId(name?: string | null): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const [found] = await sql<{ id: string }[]>`
    select id from agents where name = ${n} and is_active limit 1`;
  if (found) return found.id;
  const [created] = await sql<{ id: string }[]>`
    insert into agents (name, team) values (${n}, 'reception') returning id`;
  return created.id;
}
