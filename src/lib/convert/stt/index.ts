// 활성 STT 제공자 선택 — 현재는 OpenAI Whisper. 교체 시 여기만 바꾸면 된다.
import type { SttProvider } from "./types";
import { whisperProvider } from "./whisper";

// 추후: process.env.STT_PROVIDER 로 분기(deepgram·assemblyai 등) 가능.
export function getSttProvider(): SttProvider {
  return whisperProvider;
}

export function isSttConfigured(): boolean {
  return getSttProvider().isConfigured();
}

export type { SttProvider, SttResult } from "./types";
