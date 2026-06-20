// 파일 저장 — P0 에서는 로컬 파일시스템.
// (Supabase Storage 전환은 P2 예정: 이 모듈의 구현만 교체하면 된다.)
import { promises as fs } from "fs";
import path from "path";

const PUBLIC_IMAGE_DIR = path.join(process.cwd(), "public", "uploaded");
const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

// 상담 캡처 이미지 저장 (jpg/jpeg/png) → 공개 경로 반환
export async function saveImage(file: File): Promise<string> {
  await fs.mkdir(PUBLIC_IMAGE_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  const rawExt = (file.name.split(".").pop() ?? "png").toLowerCase();
  const ext = /^(png|jpg|jpeg)$/.test(rawExt) ? rawExt : "png";
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await fs.writeFile(path.join(PUBLIC_IMAGE_DIR, name), buf);
  return `/uploaded/${name}`;
}

// 업로드 원본 파일 보관(채팅로그 등) → 저장 경로 반환.
// 원본 보존 원칙: 그대로 1바이트도 바꾸지 않고 저장한다.
export async function saveOriginalFile(
  buf: Buffer,
  fileHash: string,
  ext: string,
): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${fileHash}.${ext}`;
  const full = path.join(UPLOAD_DIR, name);
  await fs.writeFile(full, buf);
  return path.relative(process.cwd(), full).replace(/\\/g, "/");
}
