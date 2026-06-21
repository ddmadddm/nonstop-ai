// 상담자료 업로드 파이프라인 — 모든 파일 종류를 한 메뉴에서 처리.
//   업로드(원본보관) → 변환(chat 파싱 / audio STT / image·pdf OCR) → conversation 생성.
//   이후 AI 추출은 기존 runExtraction(대화 단위) 재사용.
//   원칙: 원본 보관, 변환결과 저장, 변환 실패해도 원본은 보존(status='convert_failed').
import { createHash } from "node:crypto";
import { sql, resolveAgentId } from "./client";
import { importChatlog } from "./chatlogs";
import { runExtraction } from "./extractions";
import { saveOriginalFile } from "@/lib/storage";
import { detectMaterial, type MaterialKind } from "@/lib/convert/detect";
import { getSttProvider, isSttConfigured } from "@/lib/convert/stt";
import { ocrImage, ocrPdf } from "@/lib/convert/ocr";

function sha256(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

export interface Material {
  id: string;
  filename: string;
  file_type: string;
  kind: MaterialKind;
  status: string; // uploaded | converting | convert_failed | converted
  conversion_error: string | null;
  conversation_id: string | null;
  extraction_deferred?: boolean; // 대형 채팅방 등으로 자동 추출을 보류했는지
}

// 대형(오래된) 카카오톡 채팅방 판별 기준 — 메시지 수가 이 값을 넘으면 단일 상담으로 보지 않고
//   자동 추출을 보류한다(원본/변환만 보관). 향후 '상담 단위 분리'(docs/13)에서 세그먼트별 추출.
const AUTO_EXTRACT_MAX_MESSAGES = Number(process.env.AUTO_EXTRACT_MAX_MESSAGES ?? 400);

export interface CreateResult {
  ok: boolean;
  duplicate?: boolean;
  overwritten?: boolean; // 동일 내용 활성 자료를 덮어쓴 경우
  message: string;
  material?: Material;
}

function rowToMaterial(r: Record<string, unknown>): Material {
  return {
    id: r.id as string,
    filename: r.filename as string,
    file_type: r.file_type as string,
    kind: r.kind as MaterialKind,
    status: r.status as string,
    conversion_error: (r.conversion_error as string) ?? null,
    conversation_id: (r.conversation_id as string) ?? null,
  };
}

// 1) 원본 저장 + 자료 행 생성(중복 파일 차단).
export async function createMaterial(input: {
  filename: string;
  buffer: Buffer;
  fileType: string;
  kind: MaterialKind;
  createdByName?: string;
}): Promise<CreateResult> {
  const fileHash = sha256(input.buffer);
  const createdBy = await resolveAgentId(input.createdByName);

  // 동일 내용이 활성 상태로 이미 있으면 → 덮어쓰기(기존 활성본 + 연결 대화/배치 비활성화 후 재적재).
  //   소프트삭제(비활성)된 동일 파일은 무시되어 자유롭게 재업로드된다.
  const [dup] = await sql<{ id: string; conversation_id: string | null }[]>`
    select id, conversation_id from consultation_materials
    where file_hash = ${fileHash} and is_active limit 1`;
  const overwritten = Boolean(dup);
  if (dup) {
    await sql`
      update consultation_materials
      set is_active=false, deactivated_at=now(), deactivated_by=${createdBy}, updated_by=${createdBy}
      where id=${dup.id} and is_active`;
    if (dup.conversation_id) await deactivateConversationCascade(dup.conversation_id, createdBy);
  }

  const storedPath = await saveOriginalFile(input.buffer, fileHash, input.fileType);

  const [row] = await sql<Record<string, unknown>[]>`
    insert into consultation_materials
      (filename, file_type, kind, file_hash, byte_size, stored_path, status, created_by, updated_by)
    values (${input.filename}, ${input.fileType}, ${input.kind}, ${fileHash},
            ${input.buffer.byteLength}, ${storedPath}, 'uploaded', ${createdBy}, ${createdBy})
    returning id, filename, file_type, kind, status, conversion_error, conversation_id`;
  return {
    ok: true,
    overwritten,
    message: overwritten ? "덮어쓰기 완료(이전본 보관)" : "업로드 완료",
    material: rowToMaterial(row),
  };
}

async function logConversion(
  materialId: string,
  kind: string,
  ok: boolean,
  model: string | null,
  ms: number,
  chars: number | null,
  error: string | null,
  by: string | null,
) {
  await sql`
    insert into conversion_logs (material_id, kind, status, model, duration_ms, char_count, error, created_by)
    values (${materialId}, ${kind}, ${ok ? "success" : "failed"}, ${model}, ${ms}, ${chars}, ${error}, ${by})`;
}

async function markFailed(materialId: string, error: string, by: string | null) {
  await sql`
    update consultation_materials
    set status='convert_failed', conversion_error=${error}, updated_by=${by}
    where id=${materialId} and is_active`;
}

// 변환 텍스트(STT/OCR) → 추출용 대화 1건 생성.
async function createMaterialConversation(
  filename: string,
  by: string | null,
): Promise<string> {
  const [conv] = await sql<{ id: string }[]>`
    insert into conversations (title, source_system, channel, message_count, created_by, updated_by)
    values (${filename}, 'material', 'upload', 1, ${by}, ${by})
    returning id`;
  return conv.id;
}

// 2) 변환 — kind 로 분기. 성공 시 conversation_id 연결 + status='converted'.
// 변환 성공 직후 AI 추출까지 자동 연결(best-effort).
//   추출 실패는 변환 성공에 영향을 주지 않는다(runExtraction 이 실패상태/로그를 남기므로
//   화면에서 재추출할 수 있다). 비용이 드는 AI 호출이므로 변환이 성공한 경우에만 실행.
async function autoExtract(conversationId: string, byName?: string): Promise<void> {
  try {
    await runExtraction(conversationId, byName);
  } catch {
    // 무시: 변환은 이미 완료됨. 추출은 나중에 재시도 가능.
  }
}

export async function convertMaterial(
  material: Material,
  buffer: Buffer,
  byName?: string,
): Promise<Material> {
  const by = await resolveAgentId(byName);
  const mime = detectMaterial(material.filename)?.mime ?? "application/octet-stream";
  await sql`update consultation_materials set status='converting', updated_by=${by} where id=${material.id} and is_active`;
  const t0 = Date.now();

  try {
    if (material.kind === "chat") {
      // CSV/XLSX/TXT — 기존 채팅로그 파이프라인 재사용(raw→parsed→training + 직원/고객 분류).
      const r = await importChatlog({ filename: material.filename, buffer, createdByName: byName });
      const convId = r.conversationIds?.[0];
      if (!r.ok || !convId) {
        await markFailed(material.id, r.message || "메시지 파싱 실패", by);
        await logConversion(material.id, material.kind, false, "parser", Date.now() - t0, null, r.message, by);
        return { ...material, status: "convert_failed", conversion_error: r.message };
      }
      await sql`
        update consultation_materials
        set status='converted', conversation_id=${convId}, conversion_model='parser',
            conversion_ms=${Date.now() - t0}, conversion_error=null, updated_by=${by}
        where id=${material.id} and is_active`;
      await logConversion(material.id, material.kind, true, "parser", Date.now() - t0, null, null, by);
      // 대형 채팅방(다수 상담 혼재)은 자동 추출 보류 → 원본 자료실에 '보관중'으로 저장.
      //   원본(raw/parsed)은 불변 보관. 추후 분석/분리/학습 단계로 진행(docs/13).
      const deferred = (r.totalRows ?? 0) > AUTO_EXTRACT_MAX_MESSAGES;
      if (deferred) {
        await sql`
          update consultation_materials
          set is_archive=true, archive_status='archived', updated_by=${by}
          where id=${material.id} and is_active`;
      } else {
        await autoExtract(convId, byName);
      }
      return {
        ...material,
        status: "converted",
        conversation_id: convId,
        conversion_error: null,
        extraction_deferred: deferred,
      };
    }

    // audio / image / pdf → 텍스트 변환
    let text: string;
    let model: string;
    if (material.kind === "audio") {
      if (!isSttConfigured()) {
        const msg = "STT가 설정되지 않았습니다(.env 에 OPENAI_API_KEY 필요).";
        await markFailed(material.id, msg, by);
        await logConversion(material.id, material.kind, false, getSttProvider().name, Date.now() - t0, null, msg, by);
        return { ...material, status: "convert_failed", conversion_error: msg };
      }
      const r = await getSttProvider().transcribe(buffer, material.filename, mime);
      text = r.text;
      model = r.model;
    } else if (material.kind === "image") {
      const r = await ocrImage(buffer, mime);
      text = r.text;
      model = r.model;
    } else {
      const r = await ocrPdf(buffer);
      text = r.text;
      model = r.model;
    }

    const convId = await createMaterialConversation(material.filename, by);
    await sql`
      update consultation_materials
      set status='converted', converted_text=${text}, conversion_model=${model},
          conversion_ms=${Date.now() - t0}, conversation_id=${convId},
          conversion_error=null, updated_by=${by}
      where id=${material.id} and is_active`;
    await logConversion(material.id, material.kind, true, model, Date.now() - t0, text.length, null, by);
    // 음성·이미지·PDF는 단일 상담 단위이므로 항상 자동 추출.
    await autoExtract(convId, byName);
    return {
      ...material,
      status: "converted",
      conversation_id: convId,
      conversion_error: null,
      extraction_deferred: false,
    };
  } catch (e) {
    const msg = (e as Error).message;
    await markFailed(material.id, msg, by);
    await logConversion(material.id, material.kind, false, null, Date.now() - t0, null, msg, by);
    return { ...material, status: "convert_failed", conversion_error: msg };
  }
}

// ── 삭제 = 비활성화(④) ────────────────────────────────────────────────
//   물리삭제는 트리거로 차단된다. is_active=false 로 가린다(감사이력 보존).
//   대화 단위로 연결된 추출/학습데이터까지 함께 비활성화해 검색·답변에서 사라지게 한다.
//   raw_messages/parsed_messages/chat_upload_batches 는 is_active 가 없으나, 모든 조회가
//   conversations.is_active 를 거치므로 대화 비활성화로 함께 가려진다.
export async function deactivateConversationCascade(
  conversationId: string,
  by: string | null,
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update conversations
      set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
      where id=${conversationId} and is_active`;
    await tx`
      update conversation_extractions
      set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
      where conversation_id=${conversationId} and is_active`;
    // ai_training_data 는 감사 트리거/updated 컬럼이 없는 append 계층 → 단순 비활성화.
    await tx`
      update ai_training_data set is_active=false
      where conversation_id=${conversationId} and is_active`;
    // 연결된 업로드 배치(채팅로그)도 비활성화 → 동일 내용 재업로드 시 유일 인덱스 충돌 방지.
    //   배치는 감사 트리거가 없어 updated_by 컬럼이 없다(deactivated_* 만 기록).
    //   chat 이 아닌 자료(STT/OCR)는 batch_id 가 null 이라 영향 없음.
    await tx`
      update chat_upload_batches
      set is_active=false, deactivated_at=now(), deactivated_by=${by}
      where id = (select batch_id from conversations where id=${conversationId}) and is_active`;
  });
}

export interface DeactivateResult {
  ok: boolean;
  message: string;
}

// 업로드 자료 1건 삭제(비활성화). 잘못 올린 파일 제거용. 연결 대화까지 함께 비활성화.
export async function deactivateMaterial(
  materialId: string,
  byName?: string,
): Promise<DeactivateResult> {
  const by = await resolveAgentId(byName);
  const [mat] = await sql<{ id: string; conversation_id: string | null; filename: string }[]>`
    select id, conversation_id, filename from consultation_materials
    where id=${materialId} and is_active`;
  if (!mat) return { ok: false, message: "이미 삭제되었거나 존재하지 않는 자료입니다." };

  await sql`
    update consultation_materials
    set is_active=false, deactivated_at=now(), deactivated_by=${by}, updated_by=${by}
    where id=${materialId} and is_active`;
  if (mat.conversation_id) {
    await deactivateConversationCascade(mat.conversation_id, by);
  }
  return { ok: true, message: `삭제 완료: ${mat.filename}` };
}

// 목록 — 변환 상태 + 추출 상태를 합쳐 표시상태(7종) 계산용 원시값 반환.
export interface MaterialListItem {
  id: string;
  filename: string;
  file_type: string;
  kind: MaterialKind;
  status: string; // 변환 단계
  conversion_error: string | null;
  conversation_id: string | null;
  ext_status: string | null; // conversation_extractions.status
  needs_review: boolean | null;
  is_urgent: boolean | null;
  is_archive: boolean; // 원본 자료실 보관 대상(대형 채팅방)
  archive_status: string | null; // archived | analyzed | segmented | learned
  created_at: string;
  created_by_name: string | null;
}

export async function listMaterials(): Promise<MaterialListItem[]> {
  const rows = await sql<(Omit<MaterialListItem, "created_at"> & { created_at: Date })[]>`
    select m.id, m.filename, m.file_type, m.kind, m.status, m.conversion_error,
           m.conversation_id, m.created_at, m.is_archive, m.archive_status,
           e.status as ext_status, e.needs_review, e.is_urgent,
           a.name as created_by_name
    from consultation_materials m
    left join conversation_extractions e
           on e.conversation_id = m.conversation_id and e.is_active
    left join agents a on a.id = m.created_by
    where m.is_active
    order by m.created_at desc`;
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}

export interface MaterialStats {
  total: number;
  converting: number;
  failed: number;
  confirmed: number;
}
export async function getMaterialStats(): Promise<MaterialStats> {
  const [r] = await sql<MaterialStats[]>`
    select
      count(*)::int as total,
      count(*) filter (where status='converting')::int as converting,
      count(*) filter (where status='convert_failed')::int as failed,
      count(*) filter (where conversation_id in (
        select conversation_id from conversation_extractions where is_active and status='confirmed'
      ))::int as confirmed
    from consultation_materials where is_active`;
  return r;
}
