// 대형 채팅방(원본 자료실) 파생물 — ① 자동 분석 + ⑤ 상담 단위 분리 저장.
//   원본(parsed_messages)은 읽기만 한다. 결과는 chat_archive_analysis / conversation_segments 에 적재.
//   재실행 시 기존 활성 행을 비활성화하고 새로 적재(원본 불변, 변경이력은 fn_audit).
import { sql, resolveAgentId } from "./client";
import { createClient } from "./clients";
import { segmentChatMessages, type SegMessage, type Segment } from "@/lib/import/segment";

const INSERT_CHUNK = 1000;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── 타입 ─────────────────────────────────────────────────────────────
export interface Participant {
  name: string | null;
  type: string;
  count: number;
}
export interface ArchiveAnalysis {
  client_guess: string | null;
  client_id: string | null;
  client_name: string | null;
  client_score: number | null;
  period_start: string | null;
  period_end: string | null;
  active_days: number | null;
  message_total: number | null;
  participants: Participant[];
}
export interface SegmentRow {
  id: string;
  seq: number;
  start_seq: number;
  end_seq: number;
  message_count: number;
  started_at: string | null;
  ended_at: string | null;
  triggers: string[];
  signals: { intake?: boolean; order?: boolean; dispatch?: boolean };
  client_hint: string | null;
  // ⑥ 세그먼트별 AI 추출 결과 요약(있으면)
  ext_status: string | null;
  ext_needs_review: boolean | null;
  ext_client: string | null;
  ext_manager: string | null;
  ext_phone: string | null;
  ext_origin: string | null;
  ext_destination: string | null;
  ext_vehicle: string | null;
}

async function loadSegMessages(conversationId: string): Promise<SegMessage[]> {
  const rows = await sql<
    { seq: number; sender_type: string; sender_name: string | null; content: string | null; sent_at: Date | null }[]
  >`select seq, sender_type, sender_name, content, sent_at
    from parsed_messages where conversation_id=${conversationId} order by seq`;
  return rows.map((r) => ({
    seq: r.seq,
    senderType: r.sender_type,
    senderName: r.sender_name,
    content: r.content ?? "",
    sentAt: r.sent_at,
  }));
}

// ── ① 자동 분석(②거래처추정·③기간·④참여자) ────────────────────────
export async function analyzeArchive(
  conversationId: string,
  byName?: string,
): Promise<ArchiveAnalysis> {
  const by = await resolveAgentId(byName);

  const [period] = await sql<
    { period_start: Date | null; period_end: Date | null; message_total: number; active_days: number }[]
  >`
    select min(sent_at) as period_start, max(sent_at) as period_end,
           count(*)::int as message_total,
           count(distinct (sent_at at time zone 'Asia/Seoul')::date)::int as active_days
    from parsed_messages where conversation_id=${conversationId}`;

  const parts = await sql<{ name: string | null; type: string; count: number }[]>`
    select sender_name as name, sender_type as type, count(*)::int as count
    from parsed_messages where conversation_id=${conversationId}
    group by sender_name, sender_type
    order by count desc limit 30`;

  // ② 거래처 추정: 방 이름(파일명)이 보통 거래처를 담는다 → 우선. 없으면 최다 고객 발화자명.
  const topCustomer = parts.find((p) => p.type !== "staff" && p.name)?.name ?? null;
  const [conv] = await sql<{ title: string | null }[]>`
    select title from conversations where id=${conversationId}`;
  const titleGuess = (conv?.title ?? "").replace(/\.(txt|csv|xlsx)$/i, "").trim() || null;
  const clientGuess = titleGuess ?? topCustomer;

  // 기존 거래처 매칭(유사도)
  let clientId: string | null = null;
  let clientScore: number | null = null;
  if (clientGuess) {
    const [best] = await sql<{ id: string; name: string; score: number }[]>`
      select id, name, similarity(name, ${clientGuess}) as score
      from clients where is_active order by score desc limit 1`;
    if (best) {
      clientScore = best.score;
      if (best.score >= 0.3) clientId = best.id;
    }
  }

  const participants = parts.map((p) => ({ name: p.name, type: p.type, count: p.count }));
  const summary = {
    message_total: period?.message_total ?? 0,
    active_days: period?.active_days ?? 0,
    customer_count: participants.filter((p) => p.type !== "staff").length,
    staff_count: participants.filter((p) => p.type === "staff").length,
  };

  await sql.begin(async (tx) => {
    await tx`
      update chat_archive_analysis
      set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
      where conversation_id=${conversationId} and is_active`;
    await tx`
      insert into chat_archive_analysis
        (conversation_id, client_guess, client_id, client_score,
         period_start, period_end, active_days, message_total,
         participants, summary, created_by, updated_by)
      values
        (${conversationId}, ${clientGuess}, ${clientId}, ${clientScore},
         ${period?.period_start ?? null}, ${period?.period_end ?? null},
         ${period?.active_days ?? null}, ${period?.message_total ?? null},
         ${tx.json(participants)}, ${tx.json(summary)}, ${by}, ${by})`;
  });

  // 보관중 → 분석완료 (이미 분리완료면 유지)
  await sql`
    update consultation_materials set archive_status='analyzed', updated_by=${by}
    where conversation_id=${conversationId} and is_active and is_archive and archive_status='archived'`;

  return (await getAnalysis(conversationId))!;
}

// 이 방(대형 채팅방)을 특정 거래처로 지정 — 지식베이스 귀속의 근거가 된다(⑦).
export async function assignArchiveClient(
  conversationId: string,
  clientId: string,
  byName?: string,
): Promise<void> {
  const by = await resolveAgentId(byName);
  await sql`
    update chat_archive_analysis set client_id=${clientId}, updated_by=${by}
    where conversation_id=${conversationId} and is_active`;
}

// 분석에서 추정한 거래처명으로 신규 거래처 생성 + 이 방에 지정.
export async function createClientFromArchive(
  conversationId: string,
  byName?: string,
): Promise<string> {
  const an = await getAnalysis(conversationId);
  const name = (an?.client_guess ?? "").trim();
  if (!name) throw new Error("거래처 추정명이 없습니다. 먼저 분석을 실행하세요.");
  const id = await createClient({ name }, byName);
  await assignArchiveClient(conversationId, id, byName);
  return id;
}

export async function getAnalysis(conversationId: string): Promise<ArchiveAnalysis | null> {
  const rows = await sql<
    {
      client_guess: string | null; client_id: string | null; client_name: string | null;
      client_score: number | null; period_start: Date | null; period_end: Date | null;
      active_days: number | null; message_total: number | null; participants: Participant[];
    }[]
  >`
    select a.client_guess, a.client_id, c.name as client_name, a.client_score,
           a.period_start, a.period_end, a.active_days, a.message_total, a.participants
    from chat_archive_analysis a
    left join clients c on c.id = a.client_id
    where a.conversation_id=${conversationId} and a.is_active`;
  const r = rows[0];
  if (!r) return null;
  return {
    ...r,
    period_start: r.period_start ? r.period_start.toISOString() : null,
    period_end: r.period_end ? r.period_end.toISOString() : null,
  };
}

// ── ⑤ 상담 단위 분리 ─────────────────────────────────────────────────
export async function runSegmentation(
  conversationId: string,
  byName?: string,
  opts?: { gapMinutes?: number; minMessages?: number },
): Promise<number> {
  const by = await resolveAgentId(byName);
  const msgs = await loadSegMessages(conversationId);
  if (msgs.length === 0) throw new Error("원본 메시지가 없습니다.");
  const segs: Segment[] = segmentChatMessages(msgs, opts ?? {});

  await sql.begin(async (tx) => {
    await tx`
      update conversation_segments
      set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
      where conversation_id=${conversationId} and is_active`;
    const rows = segs.map((s) => ({
      conversation_id: conversationId,
      seq: s.index,
      start_seq: s.startSeq,
      end_seq: s.endSeq,
      message_count: s.messageCount,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      triggers: tx.json(s.triggers),
      signals: tx.json(s.signals),
      client_hint: s.clientHint,
      created_by: by,
      updated_by: by,
    }));
    for (const part of chunk(rows, INSERT_CHUNK)) {
      await tx`insert into conversation_segments ${tx(part)}`;
    }
  });

  // → 분리완료
  await sql`
    update consultation_materials set archive_status='segmented', updated_by=${by}
    where conversation_id=${conversationId} and is_active and is_archive`;

  return segs.length;
}

export async function listSegments(conversationId: string): Promise<SegmentRow[]> {
  const rows = await sql<
    (Omit<SegmentRow, "started_at" | "ended_at"> & { started_at: Date | null; ended_at: Date | null })[]
  >`
    select s.id, s.seq, s.start_seq, s.end_seq, s.message_count, s.started_at, s.ended_at,
           s.triggers, s.signals, s.client_hint,
           e.status as ext_status, e.needs_review as ext_needs_review,
           e.client_name as ext_client, e.manager_name as ext_manager, e.phone as ext_phone,
           e.origin as ext_origin, e.destination as ext_destination, e.vehicle_type as ext_vehicle
    from conversation_segments s
    left join conversation_extractions e
      on e.conversation_id = s.conversation_id and e.segment_id = s.id and e.is_active
    where s.conversation_id=${conversationId} and s.is_active
    order by s.seq`;
  return rows.map((r) => ({
    ...r,
    started_at: r.started_at ? r.started_at.toISOString() : null,
    ended_at: r.ended_at ? r.ended_at.toISOString() : null,
  }));
}

export interface SegMsg {
  seq: number;
  sender_type: string;
  sender_name: string | null;
  content: string | null;
  sent_at: string | null;
}
export async function getSegmentMessages(
  conversationId: string,
  startSeq: number,
  endSeq: number,
): Promise<SegMsg[]> {
  const rows = await sql<(Omit<SegMsg, "sent_at"> & { sent_at: Date | null })[]>`
    select seq, sender_type, sender_name, content, sent_at
    from parsed_messages
    where conversation_id=${conversationId} and seq between ${startSeq} and ${endSeq}
    order by seq`;
  return rows.map((r) => ({ ...r, sent_at: r.sent_at ? r.sent_at.toISOString() : null }));
}
