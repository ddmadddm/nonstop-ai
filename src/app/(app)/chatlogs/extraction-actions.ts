"use server";

import { revalidatePath } from "next/cache";
import {
  runExtraction,
  saveExtractionEdits,
  confirmExtraction,
} from "@/lib/db/extractions";
import { resolveAndSaveExtractionAddresses } from "@/lib/db/addresses";
import type { ExtractionFields } from "@/lib/ai/extract";
import { getActorName } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// 등록자/검수자 = 로그인 사용자(세션). 미상이면 undefined.
async function actor(): Promise<string | undefined> {
  return (await getActorName()) ?? undefined;
}

// AI 자동 추출(최초/재추출)
export async function runExtractionAction(
  conversationId: string,
): Promise<ActionResult> {
  try {
    const by = await actor();
    await runExtraction(conversationId, by);
    // 추출된 출발지/도착지의 주소 변환(신/구/가격표)도 이어서 실행(best-effort).
    await resolveAndSaveExtractionAddresses(conversationId, by).catch(() => {});
    revalidatePath(`/chatlogs/${conversationId}`);
    revalidatePath("/chatlogs");
    return { ok: true, message: "AI 추출 완료" };
  } catch (e) {
    return { ok: false, message: `추출 실패: ${(e as Error).message}` };
  }
}

// 주소 변환만 단독 재실행(직원 확인용 '주소 변환' 버튼).
export async function resolveAddressesAction(
  conversationId: string,
): Promise<ActionResult> {
  try {
    const r = await resolveAndSaveExtractionAddresses(conversationId, await actor());
    revalidatePath(`/chatlogs/${conversationId}`);
    return { ok: r.ok, message: r.message };
  } catch (e) {
    return { ok: false, message: `주소 변환 실패: ${(e as Error).message}` };
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
    await saveExtractionEdits(conversationId, edits, await actor());
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
    await confirmExtraction(conversationId, await actor());
    revalidatePath(`/chatlogs/${conversationId}`);
    revalidatePath("/chatlogs");
    return { ok: true, message: "확정 완료" };
  } catch (e) {
    return { ok: false, message: `확정 실패: ${(e as Error).message}` };
  }
}
