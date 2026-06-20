// 샘플 추출 점검용 일회성 러너.
//   docs/samples/chatlog-sample.csv 를 실제 파서(parseChatlogFile)로 읽고,
//   앱과 동일한 트랜스크립트 포맷으로 만들어 extractConsultation 에 넘긴다.
//   실행: node --env-file=.env scripts/test-extract.mjs
import { readFileSync } from "node:fs";
import { parseChatlogFile } from "../src/lib/import/chatlog.ts";
import { extractConsultation, FIELD_KEYS } from "../src/lib/ai/extract.ts";

const STAFF = (name) =>
  name.includes("논스톱") ||
  (process.env.NONSTOP_STAFF_NAMES ?? "논스톱서비스")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(name.toLowerCase());

const path = "docs/samples/chatlog-sample.csv";
const parsed = await parseChatlogFile(readFileSync(path), path);

const transcript = parsed.rows
  .map((r) => {
    const who = STAFF(r.user_raw) ? "직원" : "고객";
    return `[${who}/${r.user_raw}] ${r.message_raw}`;
  })
  .join("\n");

console.log("=== 트랜스크립트 ===");
console.log(transcript);
console.log(`\n=== 추출 (model=${process.env.ANTHROPIC_EXTRACT_MODEL ?? "claude-haiku-4-5"}) ===`);

const t0 = Date.now();
const { fields, confidence, model } = await extractConsultation(transcript);
const ms = Date.now() - t0;

const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;
for (const k of FIELD_KEYS) {
  console.log(`  ${k.padEnd(18)} ${String(fields[k] ?? "—").padEnd(24)} ${pct(confidence[k])}`);
}
console.log(`\n응답 모델: ${model} · ${ms}ms`);
