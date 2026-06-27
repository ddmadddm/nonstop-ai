"use server";

import { revalidatePath } from "next/cache";
import {
  addConsultation,
  deactivateConsultation,
} from "@/lib/db/consultations";
import type { NewConsultation } from "@/lib/db/consultations";
import { getActorName } from "@/lib/auth";

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
  // 상담내용은 원문 그대로 보존 (trim하지 않음). 빈값 판정에만 trim 사용.
  const contentRaw = formData.get("content");
  const content =
    typeof contentRaw === "string" && contentRaw.trim() !== ""
      ? contentRaw
      : undefined;

  if (!content) {
    return { ok: false, message: "상담내용을 입력해 주세요." };
  }

  try {
    // 등록자는 폼이 아니라 로그인 사용자로 자동 기록.
    const rec: NewConsultation = {
      consultation_content_original: content, // 원문 그대로
      image_urls: [],
      created_by: (await getActorName()) ?? undefined,
    };

    await addConsultation(rec);
    revalidatePath("/chatlogs");
    revalidatePath("/conversations");
    return { ok: true, message: "저장 완료 — 상담내용 원문" };
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
