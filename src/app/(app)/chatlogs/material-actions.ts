"use server";

import { revalidatePath } from "next/cache";
import {
  createMaterial,
  convertMaterial,
  deactivateMaterial,
} from "@/lib/db/materials";
import { detectMaterial, SUPPORTED_EXTENSIONS } from "@/lib/convert/detect";
import { getActorName } from "@/lib/auth";

export interface UploadMaterialResult {
  ok: boolean;
  duplicate?: boolean;
  overwritten?: boolean; // 동일 내용 활성 자료를 덮어쓴 경우
  message: string;
  filename: string;
  status?: string; // converted | convert_failed
  conversationId?: string; // 변환 성공 시 자동추출 대상
  conversionError?: string;
  extractionDeferred?: boolean; // 대형 채팅방 등으로 자동 추출 보류
}

// 단일 파일: 종류 자동판별 → 원본 저장 → 변환(파싱/STT/OCR). 추출은 클라이언트가 이어서 실행.
export async function uploadMaterialAction(formData: FormData): Promise<UploadMaterialResult> {
  const file = formData.get("file");
  const formCreatedBy =
    typeof formData.get("created_by") === "string"
      ? (formData.get("created_by") as string).trim() || undefined
      : undefined;
  // 폼에 등록자가 비어 있으면 로그인 사용자로 자동 기록.
  const createdBy = formCreatedBy ?? (await getActorName()) ?? undefined;

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "파일이 비어 있습니다.", filename: file instanceof File ? file.name : "" };
  }
  const detected = detectMaterial(file.name);
  if (!detected) {
    return {
      ok: false,
      filename: file.name,
      message: `지원하지 않는 형식입니다. 가능: ${SUPPORTED_EXTENSIONS.join(", ")}`,
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const created = await createMaterial({
      filename: file.name,
      buffer,
      fileType: detected.fileType,
      kind: detected.kind,
      createdByName: createdBy,
    });
    if (!created.ok || !created.material) {
      return { ok: false, duplicate: created.duplicate, message: created.message, filename: file.name };
    }

    const converted = await convertMaterial(created.material, buffer, createdBy);
    revalidatePath("/chatlogs");

    if (converted.status === "convert_failed") {
      return {
        ok: false,
        filename: file.name,
        status: "convert_failed",
        message: "변환 실패(원본은 보관됨)",
        conversionError: converted.conversion_error ?? undefined,
      };
    }
    return {
      ok: true,
      overwritten: created.overwritten,
      filename: file.name,
      status: "converted",
      message: created.overwritten ? "덮어쓰기 완료(이전본 보관)" : "변환 완료",
      conversationId: converted.conversation_id ?? undefined,
      extractionDeferred: converted.extraction_deferred ?? false,
    };
  } catch (e) {
    return { ok: false, filename: file.name, message: `업로드 실패: ${(e as Error).message}` };
  }
}

export interface DeleteMaterialResult {
  ok: boolean;
  message: string;
}

// 잘못 올린 자료 삭제(비활성화). 연결된 대화·추출·학습데이터까지 함께 가려진다(원본/이력은 보존).
export async function deleteMaterialAction(
  materialId: string,
): Promise<DeleteMaterialResult> {
  if (!materialId) return { ok: false, message: "잘못된 요청입니다." };
  try {
    const r = await deactivateMaterial(materialId, (await getActorName()) ?? undefined);
    if (r.ok) {
      revalidatePath("/chatlogs");
      revalidatePath("/conversations");
      revalidatePath("/assistant");
    }
    return r;
  } catch (e) {
    return { ok: false, message: `삭제 실패: ${(e as Error).message}` };
  }
}
