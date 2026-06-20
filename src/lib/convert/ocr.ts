// OCR(이미지/PDF → 텍스트) — Claude 비전 사용(별도 키 불필요, ANTHROPIC_API_KEY 재사용).
//   - 이미지(png/jpg): image 블록
//   - PDF: document 블록
//   상담 캡처(카카오/채널톡)일 수 있으므로 발화자/순서를 보존해 그대로 옮긴다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_OCR_MODEL ?? "claude-haiku-4-5";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 가 없습니다(OCR 불가).");
  return (_client ??= new Anthropic({ apiKey: key }));
}

const PROMPT = `이 파일에서 보이는 모든 텍스트를 그대로(OCR) 추출하세요.
- 카카오/채널톡 상담 캡처일 수 있습니다. 말풍선의 발화자 구분과 시간 순서를 최대한 보존하세요.
- 누가 보낸 메시지인지 알 수 있으면 줄 앞에 [고객] 또는 [직원] 으로 표시하세요(확실치 않으면 생략).
- 설명·요약 없이 추출된 텍스트만 출력하세요.`;

export interface OcrResult {
  text: string;
  model: string;
}

type ImageMedia = "image/png" | "image/jpeg";

export async function ocrImage(buf: Buffer, mime: string): Promise<OcrResult> {
  const media: ImageMedia = mime === "image/png" ? "image/png" : "image/jpeg";
  return run({
    type: "image",
    source: { type: "base64", media_type: media, data: buf.toString("base64") },
  });
}

export async function ocrPdf(buf: Buffer): Promise<OcrResult> {
  return run({
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
  });
}

async function run(block: Anthropic.ContentBlockParam): Promise<OcrResult> {
  const client = getClient();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("OCR 결과가 비어 있습니다.");
  return { text, model: message.model };
}
