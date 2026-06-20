// 채팅로그 업로드 파이프라인: raw_messages → parsed_messages → ai_training_data
//   원칙: 원본 불변, 삭제 금지, 중복 차단(file_hash/row_hash), 업로드 로그(chat_upload_batches).
import { createHash } from "node:crypto";
import { type TransactionSql } from "postgres";
import { sql, resolveAgentId } from "./client";
import { saveOriginalFile } from "@/lib/storage";
import { parseChatlogFile, fileTypeFromName } from "@/lib/import/chatlog";

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

// 논스톱서비스(직원) 계정 판별 → sender_type='staff', 그 외 'customer'
//   판별 우선순위: 1) '논스톱' 포함  2) DB 직원 명단(agents)  3) env 폴백
function staffNames(): string[] {
  const env = process.env.NONSTOP_STAFF_NAMES ?? "논스톱서비스";
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}
// agents(활성) 직원 이름 → 소문자 Set. 업로드 1회당 한 번만 로드해 행 루프에서 재사용.
async function loadStaffRoster(): Promise<Set<string>> {
  const rows = await sql<{ name: string }[]>`select name from agents where is_active`;
  return new Set(rows.map((r) => r.name.trim().toLowerCase()).filter(Boolean));
}
function isStaff(userName: string, roster?: Set<string>): boolean {
  const n = userName.trim();
  if (!n) return false;
  if (n.includes("논스톱")) return true; // 논스톱서비스/논스톱퀵 등 변형 포괄
  const lower = n.toLowerCase();
  if (roster?.has(lower)) return true; // DB 직원 명단 우선
  return staffNames().map((s) => s.toLowerCase()).includes(lower); // env 폴백
}

export interface ImportResult {
  ok: boolean;
  duplicate?: boolean;
  overwritten?: boolean; // 동일 내용 활성 배치를 덮어쓴 경우
  message: string;
  batchId?: string;
  totalRows?: number;
  conversationCount?: number;
  conversationIds?: string[]; // 업로드 후 자동추출 대상
  trainingCount?: number;
}

// 동일 내용 재업로드 시 기존 활성 배치를 비활성화(덮어쓰기) — 연결 대화·추출·학습데이터까지 함께.
//   배치 테이블은 감사 트리거가 없어 updated_by 컬럼이 없다(deactivated_* 만 기록).
//   conversations 는 fn_audit 가 있어 updated_by 를 함께 설정한다.
async function deactivateBatchCascade(
  tx: TransactionSql,
  batchId: string,
  by: string | null,
): Promise<void> {
  const convs = await tx<{ id: string }[]>`
    select id from conversations where batch_id = ${batchId} and is_active`;
  for (const c of convs) {
    await tx`
      update conversations
      set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
      where id=${c.id} and is_active`;
    await tx`
      update conversation_extractions
      set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
      where conversation_id=${c.id} and is_active`;
    await tx`update ai_training_data set is_active=false where conversation_id=${c.id} and is_active`;
  }
  // 같은 내용으로 만들어진 자료(consultation_materials)도 활성 상태면 함께 가린다.
  await tx`
    update consultation_materials
    set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
    where conversation_id in (select id from conversations where batch_id=${batchId}) and is_active`;
  await tx`
    update chat_upload_batches
    set is_active=false, deactivated_at=now(), deactivated_by=${by}
    where id=${batchId} and is_active`;
}

export async function importChatlog(params: {
  filename: string;
  buffer: Buffer;
  createdByName?: string;
}): Promise<ImportResult> {
  const { filename, buffer, createdByName } = params;
  const fileType = fileTypeFromName(filename);
  if (!fileType) {
    return { ok: false, message: "지원하지 않는 형식입니다. .xlsx · .csv(UTF-8/CP949) · .txt(카카오톡)만 가능합니다." };
  }

  const fileHash = sha256(buffer);

  // 동일 내용이 활성 상태로 이미 있으면 → 덮어쓰기(기존 활성본 비활성화 후 재적재).
  //   소프트삭제된(비활성) 동일 파일은 무시되어 자유롭게 재업로드된다.
  const [dup] = await sql<{ id: string }[]>`
    select id from chat_upload_batches where file_hash = ${fileHash} and is_active limit 1`;
  const overwritten = Boolean(dup);

  // 파싱(원본 보존) — 실패 시 어떤 것도 저장하지 않음
  const parsed = await parseChatlogFile(buffer, filename);
  if (parsed.rows.length === 0) {
    return { ok: false, message: "데이터 행이 없습니다(헤더만 존재)." };
  }

  // 원본 파일 그대로 보관
  const storedPath = await saveOriginalFile(buffer, fileHash, fileType);
  const createdBy = await resolveAgentId(createdByName);
  const staffRoster = await loadStaffRoster(); // DB 직원 명단(발화자 staff 판별용)

  const result = await sql.begin(async (tx) => {
    // 0) 덮어쓰기: 동일 내용 활성 배치가 있으면 비활성화(연결 대화·자료·학습데이터까지).
    if (dup) await deactivateBatchCascade(tx, dup.id, createdBy);

    // 1) 업로드 배치(로그)
    const [batch] = await tx<{ id: string }[]>`
      insert into chat_upload_batches
        (filename, file_type, file_hash, byte_size, stored_path, total_rows, status, created_by)
      values (${filename}, ${fileType}, ${fileHash}, ${buffer.byteLength},
              ${storedPath}, ${parsed.rows.length}, 'done', ${createdBy})
      returning id`;
    const batchId = batch.id;

    // 2) 원본 메시지(raw_messages) — 1행=1행, 불변
    const rawIds: string[] = [];
    for (const row of parsed.rows) {
      // 행 해시 시드 = 배치ID(업로드마다 고유) → 동일 내용 재업로드해도 충돌하지 않음.
      const rowHash = sha256(`${batchId}:${row.rowIndex}`);
      const [r] = await tx<{ id: string }[]>`
        insert into raw_messages
          (batch_id, row_index, raw, date_raw, user_raw, message_raw, row_hash)
        values (${batchId}, ${row.rowIndex}, ${tx.json(row.raw)},
                ${row.date_raw}, ${row.user_raw}, ${row.message_raw}, ${rowHash})
        returning id`;
      rawIds.push(r.id);
    }

    // 3) 대화 자동 그룹화 — 기본: 파일 1개 = 대화 1개(카카오 채팅방 단위)
    const times = parsed.rows
      .map((x) => x.date_value)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime());
    const firstAt = times[0] ?? null;
    const lastAt = times[times.length - 1] ?? null;

    const [conv] = await tx<{ id: string }[]>`
      insert into conversations
        (batch_id, title, source_system, message_count, first_message_at, last_message_at, created_by, updated_by)
      values (${batchId}, ${filename}, 'chatlog', ${parsed.rows.length},
              ${firstAt}, ${lastAt}, ${createdBy}, ${createdBy})
      returning id`;
    const conversationId = conv.id;

    // 4) 정제 메시지 — sender_type 분류 + 대화 연결 + 시각
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const senderType = isStaff(row.user_raw, staffRoster) ? "staff" : "customer";
      await tx`
        insert into parsed_messages
          (conversation_id, raw_message_id, seq, sender_type, sender_name, content, sent_at)
        values (${conversationId}, ${rawIds[i]}, ${i}, ${senderType},
                ${row.user_raw || null}, ${row.message_raw}, ${row.date_value})`;
    }

    // 5) AI 학습 데이터 — (직전 고객 발화 묶음) → (직원 응답) 쌍
    let trainingCount = 0;
    let pending: { text: string }[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const text = row.message_raw.trim();
      if (!text) continue;
      if (isStaff(row.user_raw, staffRoster)) {
        if (pending.length > 0) {
          const inputText = pending.map((p) => p.text).join("\n");
          // 학습쌍 dedup 시드 = 대화ID(업로드마다 고유) → 재업로드해도 충돌하지 않음.
          const dedup = sha256(`${conversationId}:qa:${row.rowIndex}`);
          await tx`
            insert into ai_training_data
              (conversation_id, kind, input_text, output_text, context, dedup_hash, created_by)
            values (${conversationId}, 'qa_pair', ${inputText}, ${text},
                    ${tx.json({ output_row_index: row.rowIndex, input_count: pending.length })},
                    ${dedup}, ${createdBy})
            on conflict (dedup_hash) where dedup_hash is not null do nothing`;
          trainingCount++;
          pending = [];
        }
        // 직원 발화 연속이면 마지막 응답만 유지(이전 pending 없으면 skip)
      } else {
        pending.push({ text });
      }
    }

    // 6) 배치 집계 갱신
    await tx`
      update chat_upload_batches set
        raw_rows = ${parsed.rows.length},
        parsed_rows = ${parsed.rows.length},
        conversation_count = 1,
        training_count = ${trainingCount}
      where id = ${batchId}`;

    return { batchId, conversationCount: 1, conversationIds: [conversationId], trainingCount };
  });

  return {
    ok: true,
    overwritten,
    message: `${overwritten ? "덮어쓰기" : "업로드"} 완료 — 원본 ${parsed.rows.length}행 · 대화 ${result.conversationCount}건 · 학습쌍 ${result.trainingCount}개`,
    batchId: result.batchId,
    totalRows: parsed.rows.length,
    conversationCount: result.conversationCount,
    conversationIds: result.conversationIds,
    trainingCount: result.trainingCount,
  };
}

// ── 조회 ──────────────────────────────────────────────────────────────
export interface BatchRow {
  id: string;
  filename: string;
  file_type: string;
  total_rows: number;
  conversation_count: number;
  training_count: number;
  status: string;
  created_by_name: string | null;
  created_at: string;
}

export async function listBatches(): Promise<BatchRow[]> {
  const rows = await sql<
    (Omit<BatchRow, "created_at"> & { created_at: Date })[]
  >`
    select b.id, b.filename, b.file_type, b.total_rows, b.conversation_count,
           b.training_count, b.status, a.name as created_by_name, b.created_at
    from chat_upload_batches b
    left join agents a on a.id = b.created_by
    where b.is_active
    order by b.created_at desc`;
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}

export interface ConversationRow {
  id: string;
  title: string | null;
  message_count: number;
  last_message_at: string | null;
  ext_status: string | null;
  needs_review: boolean | null;
  is_urgent: boolean | null;
}

export async function listConversations(): Promise<ConversationRow[]> {
  const rows = await sql<
    (Omit<ConversationRow, "last_message_at"> & { last_message_at: Date | null })[]
  >`
    select c.id, c.title, c.message_count, c.last_message_at,
           e.status as ext_status, e.needs_review, e.is_urgent
    from conversations c
    left join conversation_extractions e
      on e.conversation_id = c.id and e.is_active
    where c.is_active and c.source_system = 'chatlog'
    order by c.created_at desc`;
  return rows.map((r) => ({
    ...r,
    last_message_at: r.last_message_at ? r.last_message_at.toISOString() : null,
  }));
}

export async function getChatStats(): Promise<{
  batches: number;
  rawMessages: number;
  conversations: number;
  trainingPairs: number;
}> {
  const [r] = await sql<
    { batches: number; raw: number; convs: number; training: number }[]
  >`
    select
      (select count(*)::int from chat_upload_batches where is_active) as batches,
      (select count(*)::int from raw_messages) as raw,
      (select count(*)::int from conversations where is_active and source_system='chatlog') as convs,
      (select count(*)::int from ai_training_data where is_active) as training`;
  return {
    batches: r.batches,
    rawMessages: r.raw,
    conversations: r.convs,
    trainingPairs: r.training,
  };
}
