"use server";

import { revalidatePath } from "next/cache";
import {
  analyzeArchive,
  runSegmentation,
  getSegmentMessages,
  assignArchiveClient,
  createClientFromArchive,
  type SegMsg,
} from "@/lib/db/segments";
import { runSegmentExtraction } from "@/lib/db/extractions";
import {
  generateMatches,
  listCandidatesForSegment,
  type MatchCandidate,
} from "@/lib/db/clients";
import { getActorName } from "@/lib/auth";

export interface ArchiveActionResult {
  ok: boolean;
  message: string;
  segments?: number;
  clientId?: string;
}

// 이 방을 기존 거래처로 지정(지식베이스 귀속 근거).
export async function assignArchiveClientAction(
  conversationId: string,
  clientId: string,
): Promise<ArchiveActionResult> {
  try {
    const actor = (await getActorName()) ?? undefined;
    await assignArchiveClient(conversationId, clientId, actor);
    revalidatePath(`/chatlogs/${conversationId}`);
    return { ok: true, message: "거래처 지정 완료", clientId };
  } catch (e) {
    return { ok: false, message: `지정 실패: ${(e as Error).message}` };
  }
}

// 분석 추정명으로 신규 거래처 등록 + 이 방에 지정.
export async function createClientFromArchiveAction(
  conversationId: string,
): Promise<ArchiveActionResult> {
  try {
    const actor = (await getActorName()) ?? undefined;
    const clientId = await createClientFromArchive(conversationId, actor);
    revalidatePath(`/chatlogs/${conversationId}`);
    return { ok: true, message: "신규 거래처 등록·지정 완료", clientId };
  } catch (e) {
    return { ok: false, message: `등록 실패: ${(e as Error).message}` };
  }
}

// ① 자동 분석 + ⑤ 상담 단위 분리 (결정적, AI 비용 없음). 보관중 → 분석완료 → 분리완료.
export async function runArchivePipelineAction(
  conversationId: string,
): Promise<ArchiveActionResult> {
  try {
    const actor = (await getActorName()) ?? undefined;
    await analyzeArchive(conversationId, actor);
    const segments = await runSegmentation(conversationId, actor);
    revalidatePath(`/chatlogs/${conversationId}`);
    revalidatePath("/chatlogs");
    return { ok: true, message: `분석·분리 완료 — 상담 ${segments.toLocaleString()}건`, segments };
  } catch (e) {
    return { ok: false, message: `처리 실패: ${(e as Error).message}` };
  }
}

// ⑥ 세그먼트(상담 단위) 온디맨드 AI 추출 — 해당 구간만 추출(소액 호출).
export async function runSegmentExtractionAction(
  conversationId: string,
  segmentId: string,
  startSeq: number,
  endSeq: number,
): Promise<ArchiveActionResult> {
  try {
    const actor = (await getActorName()) ?? undefined;
    await runSegmentExtraction(conversationId, segmentId, startSeq, endSeq, actor);
    revalidatePath(`/chatlogs/${conversationId}`);
    return { ok: true, message: "AI 추출 완료" };
  } catch (e) {
    return { ok: false, message: `추출 실패: ${(e as Error).message}` };
  }
}

// ⑥ 세그먼트 거래처 매칭 — 추출 결과를 기존 거래처/담당자/주소록과 매칭(후보 생성).
export async function generateSegmentMatchesAction(
  conversationId: string,
  segmentId: string,
): Promise<ArchiveActionResult> {
  try {
    const actor = (await getActorName()) ?? undefined;
    await generateMatches(conversationId, actor, segmentId);
    revalidatePath(`/chatlogs/${conversationId}`);
    return { ok: true, message: "거래처 매칭 후보 생성" };
  } catch (e) {
    return { ok: false, message: `매칭 실패: ${(e as Error).message}` };
  }
}

// 세그먼트의 매칭 후보 조회(펼쳐보기/매칭 후 갱신).
export async function loadSegmentCandidatesAction(
  segmentId: string,
): Promise<MatchCandidate[]> {
  return listCandidatesForSegment(segmentId);
}

// 세그먼트(상담 단위) 원문 펼쳐보기 — 원본 parsed_messages 구간 조회(읽기 전용).
export async function loadSegmentMessagesAction(
  conversationId: string,
  startSeq: number,
  endSeq: number,
): Promise<SegMsg[]> {
  return getSegmentMessages(conversationId, startSeq, endSeq);
}
