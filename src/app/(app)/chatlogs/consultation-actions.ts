"use server";

import { revalidatePath } from "next/cache";
import {
  addConsultation,
  deactivateConsultation,
} from "@/lib/db/consultations";
import type { NewConsultation } from "@/lib/db/consultations";
import { saveImage } from "@/lib/storage";

// 상담자료 업로드(/chatlogs)의 "직접 입력" 섹션 — 상담 원문/캡처를 수동으로 기록.
//   파일 업로드 파이프라인과 달리 consultations 테이블에 원문 그대로 보존(AI 가공 없음).
//   (구 /uploads 메뉴를 /chatlogs 로 통합하며 이전됨.)

export interface SaveResult {
  ok: boolean;
  message: string;
}

function field(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s || undefined;
}

export async function createConsultation(
  formData: FormData,
): Promise<SaveResult> {
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  // 상담내용은 원문 그대로 보존 (trim하지 않음). 빈값 판정에만 trim 사용.
  const contentRaw = formData.get("content");
  const content =
    typeof contentRaw === "string" && contentRaw.trim() !== ""
      ? contentRaw
      : undefined;

  if (files.length === 0 && !content) {
    return { ok: false, message: "이미지 또는 상담내용을 입력해 주세요." };
  }

  try {
    // 이미지 저장 → 경로만 보관 (원문과 분리)
    const image_urls: string[] = [];
    for (const f of files) image_urls.push(await saveImage(f));

    const rec: NewConsultation = {
      client_name: field(formData.get("client_name")),
      manager_name: field(formData.get("manager_name")),
      consultation_type: field(formData.get("consultation_type")),
      consultation_content_original: content, // 원문 그대로
      image_urls,
      created_by: field(formData.get("created_by")),
    };

    await addConsultation(rec);
    revalidatePath("/chatlogs");
    revalidatePath("/conversations");
    return {
      ok: true,
      message: `저장 완료 — 이미지 ${image_urls.length}장${content ? " + 상담내용 원문" : ""}`,
    };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

// "삭제"는 물리삭제가 아니라 비활성화(④). 데이터/이미지는 보존된다.
export async function removeConsultation(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const by = field(formData.get("created_by"));
  if (typeof id === "string") {
    await deactivateConsultation(id, by);
    revalidatePath("/chatlogs");
    revalidatePath("/conversations");
  }
}
