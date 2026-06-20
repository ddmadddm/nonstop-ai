// 기존 MVP 데이터 1회 이관: .data/consultations.json → consultations 테이블.
//   - 원본 삭제 금지: JSON 은 그대로 두고 import 만 수행.
//   - 멱등: 원본 id 를 external_id(source_system='nonstop_mvp')로 보관 → 재실행해도 중복 없음.
// 실행:  npm run db:import
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL 이 없습니다. .env 를 설정하세요.");
  process.exit(1);
}

const file = path.join(process.cwd(), ".data", "consultations.json");
const sql = postgres(url, { prepare: false });

async function agentId(name) {
  const n = (name ?? "").trim();
  if (!n) return null;
  const [a] = await sql`select id from agents where name = ${n} and is_active limit 1`;
  if (a) return a.id;
  const [c] = await sql`insert into agents (name, team) values (${n}, 'reception') returning id`;
  return c.id;
}

try {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    console.log("이관할 JSON 이 없습니다(.data/consultations.json). 건너뜁니다.");
    process.exit(0);
  }
  const list = JSON.parse(raw);
  let imported = 0,
    skipped = 0;

  for (const c of list) {
    const ext = String(c.id);
    const [exist] = await sql`
      select id from consultations where source_system='nonstop_mvp' and external_id=${ext}`;
    if (exist) {
      skipped++;
      continue;
    }
    const by = await agentId(c.created_by);
    const createdAt = c.created_at ?? new Date().toISOString();
    await sql`
      insert into consultations
        (client_name, manager_name, consultation_type, content_original, image_urls,
         channel, source_system, external_id, created_at, created_by, updated_at, updated_by)
      values
        (${c.client_name ?? null}, ${c.manager_name ?? null}, ${c.consultation_type ?? null},
         ${c.consultation_content_original ?? null}, ${c.image_urls ?? []},
         'manual', 'nonstop_mvp', ${ext}, ${createdAt}, ${by},
         ${c.updated_at ?? createdAt}, ${by})`;
    imported++;
  }
  console.log(`✓ 이관 완료 — 추가 ${imported}건, 기존(중복) ${skipped}건`);
} catch (e) {
  console.error("✗ 이관 실패:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
