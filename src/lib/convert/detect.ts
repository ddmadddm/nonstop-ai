// 상담자료 파일 종류 자동 판별 — 확장자 기반(+MIME 힌트).
//   kind 로 변환 경로를 정한다: chat(파싱) · audio(STT) · image/pdf(OCR).
export type MaterialKind = "chat" | "audio" | "image" | "pdf";

export interface DetectedType {
  fileType: string; // csv·xlsx·wav·mp3·m4a·png·jpg·jpeg·pdf
  kind: MaterialKind;
  mime: string;
}

const TABLE: Record<string, { kind: MaterialKind; mime: string }> = {
  csv: { kind: "chat", mime: "text/csv" },
  xlsx: { kind: "chat", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  txt: { kind: "chat", mime: "text/plain" }, // 카카오톡 오픈채팅 대화 내보내기(.txt)
  wav: { kind: "audio", mime: "audio/wav" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  m4a: { kind: "audio", mime: "audio/mp4" },
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  pdf: { kind: "pdf", mime: "application/pdf" },
};

export const SUPPORTED_EXTENSIONS = Object.keys(TABLE);
export const ACCEPT_ATTR = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function detectMaterial(filename: string): DetectedType | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const hit = TABLE[ext];
  if (!hit) return null;
  return { fileType: ext, kind: hit.kind, mime: hit.mime };
}
