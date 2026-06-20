"use server";

import { revalidatePath } from "next/cache";
import { importChatlog } from "@/lib/db/chatlogs";

export interface UploadResult {
  ok: boolean;
  message: string;
  duplicate?: boolean;
  conversationIds?: string[]; // 업로드 후 자동추출 대상
}

// 카카오 상담톡 원본(.xlsx / .csv UTF-8) 업로드 → raw → parsed → ai_training
export async function uploadChatlog(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  const createdBy =
    typeof formData.get("created_by") === "string"
      ? (formData.get("created_by") as string).trim() || undefined
      : undefined;

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "파일을 선택해 주세요 (.xlsx 또는 .csv)." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importChatlog({
      filename: file.name,
      buffer,
      createdByName: createdBy,
    });
    if (result.ok) {
      revalidatePath("/chatlogs");
      revalidatePath("/conversations");
    }
    return {
      ok: result.ok,
      message: result.message,
      duplicate: result.duplicate,
      conversationIds: result.conversationIds,
    };
  } catch (e) {
    return { ok: false, message: `업로드 실패: ${(e as Error).message}` };
  }
}
