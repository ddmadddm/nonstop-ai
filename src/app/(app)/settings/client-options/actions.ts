"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/auth";
import {
  createOption,
  updateOption,
  deactivateOption,
  type OptionInput,
} from "@/lib/db/client-options";

export interface OptionResult {
  ok: boolean;
  message: string;
  id?: string;
}

async function actor(): Promise<string | undefined> {
  const { agent } = await requireAgent();
  return agent.name;
}

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export async function createOptionAction(categoryKey: string, fd: FormData): Promise<OptionResult> {
  try {
    const label = str(fd, "label");
    if (!label) return { ok: false, message: "항목명을 입력하세요." };
    const input: OptionInput = {
      label,
      value: str(fd, "value") ?? label,
      color: str(fd, "color"),
      sort_order: Number(str(fd, "sort_order") ?? "") || 0,
    };
    const id = await createOption(categoryKey, input, await actor());
    revalidatePath("/settings/client-options");
    revalidatePath("/clients");
    return { ok: true, message: `'${label}' 추가됨`, id };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}

export async function updateOptionAction(id: string, fd: FormData): Promise<OptionResult> {
  try {
    const label = str(fd, "label");
    if (!label) return { ok: false, message: "항목명을 입력하세요." };
    await updateOption(id, {
      label,
      color: str(fd, "color"),
      sort_order: Number(str(fd, "sort_order") ?? "") || 0,
    }, await actor());
    revalidatePath("/settings/client-options");
    return { ok: true, message: "저장됨" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateOptionAction(id: string): Promise<OptionResult> {
  try {
    await deactivateOption(id, await actor());
    revalidatePath("/settings/client-options");
    return { ok: true, message: "비활성화됨" };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// 인라인 추가(거래처 기본정보 폼의 '+ 항목 추가') — 간단 버전.
export async function quickAddOptionAction(categoryKey: string, label: string): Promise<OptionResult> {
  try {
    const l = label.trim();
    if (!l) return { ok: false, message: "항목명을 입력하세요." };
    const id = await createOption(categoryKey, { label: l, value: l }, await actor());
    revalidatePath("/settings/client-options");
    revalidatePath("/clients");
    return { ok: true, message: `'${l}' 추가됨`, id };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}
