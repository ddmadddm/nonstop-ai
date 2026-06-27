"use server";

import { revalidatePath } from "next/cache";
import {
  promoteProspectToNewClient,
  linkProspectToClient,
  rejectProspect,
} from "@/lib/db/prospects";
import { getActorName } from "@/lib/auth";

export interface ProspectActionResult {
  ok: boolean;
  message: string;
  clientId?: string;
}

async function actor(): Promise<string | undefined> {
  return (await getActorName()) ?? undefined;
}

// 신규 거래처로 등록 — clients + 담당자 + 주소 생성(요구사항 5)
export async function promoteProspectAction(
  id: string,
  fd: FormData,
): Promise<ProspectActionResult> {
  try {
    const name = (fd.get("name") as string)?.trim() ?? "";
    if (!name) return { ok: false, message: "거래처명을 입력하세요." };
    const phoneRaw = fd.get("phone");
    const phone = typeof phoneRaw === "string" && phoneRaw.trim() ? phoneRaw.trim() : null;
    const clientId = await promoteProspectToNewClient(id, { name, phone }, await actor());
    revalidatePath("/prospects");
    revalidatePath(`/prospects/${id}`);
    return { ok: true, message: "신규 거래처로 등록했습니다.", clientId };
  } catch (e) {
    return { ok: false, message: `등록 실패: ${(e as Error).message}` };
  }
}

// 기존 거래처에 연결 — 담당자/주소만 추가(요구사항 6)
export async function linkProspectAction(
  id: string,
  clientId: string,
): Promise<ProspectActionResult> {
  try {
    if (!clientId) return { ok: false, message: "연결할 거래처를 선택하세요." };
    await linkProspectToClient(id, clientId, await actor());
    revalidatePath("/prospects");
    revalidatePath(`/prospects/${id}`);
    return { ok: true, message: "기존 거래처에 연결했습니다(담당자/주소 추가).", clientId };
  } catch (e) {
    return { ok: false, message: `연결 실패: ${(e as Error).message}` };
  }
}

export async function rejectProspectAction(id: string): Promise<ProspectActionResult> {
  try {
    await rejectProspect(id, await actor());
    revalidatePath("/prospects");
    revalidatePath(`/prospects/${id}`);
    return { ok: true, message: "후보를 무시했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}
