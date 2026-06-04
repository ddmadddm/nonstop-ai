"use server";

import { revalidatePath } from "next/cache";
import {
  addConsultation,
  deleteConsultation,
  saveImage,
} from "@/lib/store";
import type { Consultation } from "@/lib/store";

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

    const now = new Date().toISOString();
    const rec: Consultation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      client_name: field(formData.get("client_name")),
      manager_name: field(formData.get("manager_name")),
      consultation_type: field(formData.get("consultation_type")),
      consultation_content_original: content, // 원문 그대로
      image_urls,
      created_by: field(formData.get("created_by")),
      created_at: now,
      updated_at: now,
    };

    await addConsultation(rec);
    revalidatePath("/uploads");
    revalidatePath("/conversations");
    return {
      ok: true,
      message: `저장 완료 — 이미지 ${image_urls.length}장${content ? " + 상담내용 원문" : ""}`,
    };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function removeConsultation(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id === "string") {
    await deleteConsultation(id);
    revalidatePath("/uploads");
    revalidatePath("/conversations");
  }
}
