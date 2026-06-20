"use server";

import { revalidatePath } from "next/cache";
import {
  runExtraction,
  saveExtractionEdits,
  confirmExtraction,
} from "@/lib/db/extractions";
import type { ExtractionFields } from "@/lib/ai/extract";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const ACTOR = "오현미"; // TODO: 로그인(Supabase Auth) 도입 시 세션 사용자로 교체

// AI 자동 추출(최초/재추출)
export async function runExtractionAction(
  conversationId: string,
): Promise<ActionResult> {
  try {
    await runExtraction(conversationId, ACTOR);
    revalidatePath(`/chatlogs/${conversationId}`);
    revalidatePath("/chatlogs");
    return { ok: true, message: "AI 추출 완료" };
  } catch (e) {
    return { ok: false, message: `추출 실패: ${(e as Error).message}` };
  }
}

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

// 직원 수정 저장(변경이력은 트리거가 자동 기록)
export async function saveExtractionAction(
  conversationId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const urgentRaw = formData.get("is_urgent");
    const edits: ExtractionFields = {
      client_name: str(formData, "client_name"),
      manager_name: str(formData, "manager_name"),
      phone: str(formData, "phone"),
      origin: str(formData, "origin"),
      destination: str(formData, "destination"),
      vehicle_type: str(formData, "vehicle_type"),
      consultation_type: str(formData, "consultation_type"),
      is_urgent:
        urgentRaw === "true" ? true : urgentRaw === "false" ? false : null,
    };
    await saveExtractionEdits(conversationId, edits, ACTOR);
    revalidatePath(`/chatlogs/${conversationId}`);
    return { ok: true, message: "저장 완료" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

// 검수 확정
export async function confirmExtractionAction(
  conversationId: string,
): Promise<ActionResult> {
  try {
    await confirmExtraction(conversationId, ACTOR);
    revalidatePath(`/chatlogs/${conversationId}`);
    revalidatePath("/chatlogs");
    return { ok: true, message: "확정 완료" };
  } catch (e) {
    return { ok: false, message: `확정 실패: ${(e as Error).message}` };
  }
}
