"use server";

import { revalidatePath } from "next/cache";
import {
  createClient,
  updateClient,
  deactivateClient,
  setDefaultOrigin,
  createContact,
  updateContact,
  deactivateContact,
  createAddress,
  updateAddress,
  deactivateAddress,
  generateMatches,
  confirmCandidateMatch,
  saveCandidateAsNew,
  rejectCandidate,
  type AddressUsage,
} from "@/lib/db/clients";
import { buildClientKnowledge } from "@/lib/db/knowledge";
import { getActorName } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

// 등록자/검수자 = 로그인 사용자(세션). 미상이면 undefined.
async function actor(): Promise<string | undefined> {
  return (await getActorName()) ?? undefined;
}

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}
function bool(fd: FormData, k: string): boolean {
  return fd.get(k) === "on" || fd.get(k) === "true";
}
function list(fd: FormData, k: string): string[] {
  const v = str(fd, k);
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// ── 거래처 ───────────────────────────────────────────────────────────
export async function createClientAction(fd: FormData): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "거래처명을 입력하세요." };
    const id = await createClient(
      {
        name,
        business_no: str(fd, "business_no"),
        phone: str(fd, "phone"),
        default_payment_method: str(fd, "default_payment_method"),
        default_vehicle_type: str(fd, "default_vehicle_type"),
        frequent_vehicle_types: list(fd, "frequent_vehicle_types"),
        fare_terms: str(fd, "fare_terms"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath("/clients");
    return { ok: true, message: "거래처 등록 완료", id };
  } catch (e) {
    return { ok: false, message: `등록 실패: ${(e as Error).message}` };
  }
}

export async function updateClientAction(
  id: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "거래처명을 입력하세요." };
    await updateClient(
      id,
      {
        name,
        business_no: str(fd, "business_no"),
        phone: str(fd, "phone"),
        default_payment_method: str(fd, "default_payment_method"),
        default_vehicle_type: str(fd, "default_vehicle_type"),
        frequent_vehicle_types: list(fd, "frequent_vehicle_types"),
        fare_terms: str(fd, "fare_terms"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return { ok: true, message: "저장 완료" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateClientAction(id: string): Promise<ActionResult> {
  try {
    await deactivateClient(id, await actor());
    revalidatePath("/clients");
    return { ok: true, message: "거래처를 비활성화했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

export async function setDefaultOriginAction(
  clientId: string,
  addressId: string | null,
): Promise<ActionResult> {
  try {
    await setDefaultOrigin(clientId, addressId, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "기본 출발지를 설정했습니다." };
  } catch (e) {
    return { ok: false, message: `설정 실패: ${(e as Error).message}` };
  }
}

// ── 담당자 ───────────────────────────────────────────────────────────
export async function createContactAction(
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "담당자명을 입력하세요." };
    await createContact(
      clientId,
      {
        name,
        title: str(fd, "title"),
        phone: str(fd, "phone"),
        email: str(fd, "email"),
        is_primary: bool(fd, "is_primary"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "담당자 추가 완료" };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}

export async function updateContactAction(
  id: string,
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) return { ok: false, message: "담당자명을 입력하세요." };
    await updateContact(
      id,
      {
        name,
        title: str(fd, "title"),
        phone: str(fd, "phone"),
        email: str(fd, "email"),
        is_primary: bool(fd, "is_primary"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "저장 완료" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateContactAction(
  id: string,
  clientId: string,
): Promise<ActionResult> {
  try {
    await deactivateContact(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "담당자를 삭제(비활성화)했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── 주소록 ───────────────────────────────────────────────────────────
export async function createAddressAction(
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const label = str(fd, "label");
    if (!label) return { ok: false, message: "주소 별칭을 입력하세요." };
    await createAddress(
      clientId,
      {
        label,
        address: str(fd, "address"),
        address_detail: str(fd, "address_detail"),
        usage_type: (str(fd, "usage_type") as AddressUsage) ?? "both",
        contact_name: str(fd, "contact_name"),
        contact_phone: str(fd, "contact_phone"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "주소 추가 완료" };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}

export async function updateAddressAction(
  id: string,
  clientId: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const label = str(fd, "label");
    if (!label) return { ok: false, message: "주소 별칭을 입력하세요." };
    await updateAddress(
      id,
      {
        label,
        address: str(fd, "address"),
        address_detail: str(fd, "address_detail"),
        usage_type: (str(fd, "usage_type") as AddressUsage) ?? "both",
        contact_name: str(fd, "contact_name"),
        contact_phone: str(fd, "contact_phone"),
        memo: str(fd, "memo"),
      },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "저장 완료" };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function deactivateAddressAction(
  id: string,
  clientId: string,
): Promise<ActionResult> {
  try {
    await deactivateAddress(id, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "주소를 삭제(비활성화)했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── AI 매칭후보 ──────────────────────────────────────────────────────
export async function generateMatchesAction(
  conversationId: string,
): Promise<ActionResult> {
  try {
    await generateMatches(conversationId, await actor());
    revalidatePath(`/chatlogs/${conversationId}`);
    revalidatePath("/clients");
    return { ok: true, message: "거래처 매칭 후보를 생성했습니다." };
  } catch (e) {
    return { ok: false, message: `매칭 실패: ${(e as Error).message}` };
  }
}

export async function confirmCandidateMatchAction(
  id: string,
): Promise<ActionResult> {
  try {
    await confirmCandidateMatch(id, await actor());
    revalidatePath("/clients");
    return { ok: true, message: "기존 데이터에 연결했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

export async function saveCandidateAsNewAction(
  id: string,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await saveCandidateAsNew(
      id,
      { clientId: str(fd, "clientId"), label: str(fd, "label") },
      await actor(),
    );
    revalidatePath("/clients");
    return { ok: true, message: "주소록/거래처에 저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장 실패: ${(e as Error).message}` };
  }
}

export async function rejectCandidateAction(id: string): Promise<ActionResult> {
  try {
    await rejectCandidate(id, await actor());
    revalidatePath("/clients");
    return { ok: true, message: "후보를 무시했습니다." };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ── ⑦ 거래처 지식베이스 ─────────────────────────────────────────────
export async function buildClientKnowledgeAction(clientId: string): Promise<ActionResult> {
  try {
    const k = await buildClientKnowledge(clientId, await actor());
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: `지식베이스 구축 완료 — 상담 ${k.total.toLocaleString()}건 집계` };
  } catch (e) {
    return { ok: false, message: `구축 실패: ${(e as Error).message}` };
  }
}

// 지식베이스의 자주 쓰는 출발/도착지를 주소록에 추가(거래처 주소록 자동 보강).
export async function addAddressFromKnowledgeAction(
  clientId: string,
  label: string,
  address: string,
  usage: AddressUsage,
): Promise<ActionResult> {
  try {
    if (!address.trim()) return { ok: false, message: "주소가 비어 있습니다." };
    await createAddress(
      clientId,
      { label: label.trim() || address.trim(), address: address.trim(), usage_type: usage },
      await actor(),
    );
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "주소록에 추가했습니다." };
  } catch (e) {
    return { ok: false, message: `추가 실패: ${(e as Error).message}` };
  }
}
