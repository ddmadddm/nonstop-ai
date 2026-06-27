// AI 학습 데이터(ai_training_data) 라이프사이클 — 후보 적재 / 확정 승격 / 통계.
//   원칙: 원본(raw_messages·converted_text)은 분리·불변. 여기서는 파생 학습데이터만 다룬다.
//   상태: candidate(후보) → confirmed(승격) / rejected(반려).
import { createHash } from "node:crypto";
import { sql } from "./client";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// STT/OCR 변환 텍스트(transcript)를 학습 후보로 적재.
//   채팅로그(CSV/XLSX)의 qa_pair 후보는 chatlogs.ts 가 적재한다(이 함수는 음성/이미지/PDF 경로).
//   dedup_hash 로 동일 대화 중복 적재를 차단(재변환해도 안전).
export async function ingestTranscriptCandidate(input: {
  conversationId: string;
  materialId: string;
  text: string;
  by: string | null;
}): Promise<void> {
  const text = input.text.trim();
  if (!text) return;
  const dedup = sha256(`${input.conversationId}:transcript`);
  await sql`
    insert into ai_training_data
      (conversation_id, kind, input_text, output_text, context, source_system,
       source_material_id, dedup_hash, status, created_by, updated_by)
    values (${input.conversationId}, 'transcript', ${text}, null,
            ${sql.json({ material_id: input.materialId })}, 'material',
            ${input.materialId}, ${dedup}, 'candidate', ${input.by}, ${input.by})
    on conflict (dedup_hash) where dedup_hash is not null do nothing`;
}

// 직원이 추출을 확정한 대화의 후보 학습데이터를 'confirmed'(승격)로 올린다.
//   확정한 데이터만 학습데이터로 승격하는 게이트. 반환값 = 승격된 행 수.
export async function promoteConversationTraining(
  conversationId: string,
  by: string | null,
): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    update ai_training_data
    set status='confirmed', confirmed_at=now(), confirmed_by=${by},
        updated_at=now(), updated_by=${by}
    where conversation_id=${conversationId} and is_active and status='candidate'
    returning id`;
  return rows.length;
}

// 학습 후보 반려(미사용 처리). 원본은 보존, 학습에서만 제외.
export async function rejectConversationTraining(
  conversationId: string,
  by: string | null,
): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    update ai_training_data
    set status='rejected', updated_at=now(), updated_by=${by}
    where conversation_id=${conversationId} and is_active and status='candidate'
    returning id`;
  return rows.length;
}

export interface TrainingStats {
  candidates: number; // 확정 대기(승격 전)
  confirmed: number; // 승격된 학습데이터
  rejected: number;
}

export async function getTrainingStats(): Promise<TrainingStats> {
  const [r] = await sql<TrainingStats[]>`
    select
      count(*) filter (where status='candidate')::int as candidates,
      count(*) filter (where status='confirmed')::int as confirmed,
      count(*) filter (where status='rejected')::int  as rejected
    from ai_training_data where is_active`;
  return r;
}
