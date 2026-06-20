// OpenAI Whisper STT 어댑터.
//   OPENAI_API_KEY 가 .env 에 있으면 동작(나중에 추가 가능). 없으면 isConfigured()=false.
//   OpenAI SDK 없이 표준 fetch + multipart 로 호출(의존성 최소화).
import "server-only";
import type { SttProvider, SttResult } from "./types";

const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const MODEL = process.env.OPENAI_STT_MODEL ?? "whisper-1";

export const whisperProvider: SttProvider = {
  name: "openai-whisper",

  isConfigured(): boolean {
    return (process.env.OPENAI_API_KEY ?? "").length > 20;
  },

  async transcribe(buf: Buffer, filename: string, mime: string): Promise<SttResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY 가 설정되지 않았습니다.");

    const form = new FormData();
    // Buffer → Blob(파일). 파일명 확장자로 OpenAI 가 포맷을 인식한다.
    const blob = new Blob([new Uint8Array(buf)], { type: mime });
    form.append("file", blob, filename);
    form.append("model", MODEL);
    form.append("language", "ko"); // 한국어 상담 우선(자동감지보다 안정적)
    form.append("response_format", "json");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Whisper STT 실패(HTTP ${res.status}): ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as { text?: string };
    const text = (data.text ?? "").trim();
    if (!text) throw new Error("STT 결과가 비어 있습니다.");
    return { text, model: MODEL };
  },
};
