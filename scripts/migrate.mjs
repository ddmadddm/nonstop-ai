// 마이그레이션 러너 — db/migrations/*.sql 을 순서대로 1회씩 적용.
// 적용 이력은 _migrations 테이블에 기록한다(중복 적용 방지).
// 실행:  npm run db:migrate   (내부적으로 node --env-file=.env)
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL 이 없습니다. .env 를 설정하세요 (.env.example 참고).");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const sql = postgres(url, { prepare: false, onnotice: () => {} });

try {
  await sql`create table if not exists _migrations (
    name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set(
    (await sql`select name from _migrations`).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) console.log("적용할 마이그레이션이 없습니다.");

  for (const f of files) {
    if (applied.has(f)) {
      console.log(`· skip   ${f}`);
      continue;
    }
    const text = await readFile(path.join(dir, f), "utf8");
    process.stdout.write(`· apply  ${f} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into _migrations (name) values (${f})`;
    });
    console.log("done");
  }
  console.log("✓ 마이그레이션 완료");
} catch (e) {
  console.error("\n✗ 마이그레이션 실패:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
