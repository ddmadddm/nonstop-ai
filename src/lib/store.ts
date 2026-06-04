// 로컬 영구 저장소 (파일 기반 임시 DB) — consultations 테이블
// 향후 Supabase 연동 시 이 모듈을 DB 구현으로 교체하면 된다 (스키마 동일).
//
// 설계 원칙(요청사항):
//  - 상담내용(consultation_content_original)은 사용자가 입력한 "원문 그대로" 저장.
//    AI 요약/수정 없음. 줄바꿈 보존.
//  - 이미지 경로(image_urls)와 원문은 분리 저장 → 나중에 OpenAI OCR/분석을 붙일 수 있게.
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "consultations.json");
const IMAGE_DIR = path.join(process.cwd(), "public", "uploaded");

// DB 테이블: consultations
export interface Consultation {
  id: string;
  client_name?: string; // 거래처
  manager_name?: string; // 담당자
  consultation_type?: string; // 상담유형
  consultation_content_original?: string; // 상담내용 원문(가공 금지)
  image_urls: string[]; // 상담 캡처 이미지 경로 (원문과 분리)
  created_by?: string; // 등록자
  created_at: string; // 등록일 (ISO)
  updated_at: string; // 수정일 (ISO)
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(IMAGE_DIR, { recursive: true });
}

async function readAll(): Promise<Consultation[]> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Consultation[];
  } catch {
    return [];
  }
}

async function writeAll(list: Consultation[]) {
  await ensureDirs();
  await fs.writeFile(DB_FILE, JSON.stringify(list, null, 2), "utf8");
}

export async function getConsultations(): Promise<Consultation[]> {
  const list = await readAll();
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getConsultation(id: string): Promise<Consultation | null> {
  return (await readAll()).find((r) => r.id === id) ?? null;
}

export async function getConsultationCount(): Promise<number> {
  return (await readAll()).length;
}

export async function addConsultation(rec: Consultation): Promise<void> {
  const list = await readAll();
  list.push(rec);
  await writeAll(list);
}

export async function deleteConsultation(id: string): Promise<void> {
  const list = await readAll();
  const target = list.find((r) => r.id === id);
  await writeAll(list.filter((r) => r.id !== id));
  for (const img of target?.image_urls ?? []) {
    try {
      await fs.unlink(path.join(process.cwd(), "public", img.replace(/^\//, "")));
    } catch {
      /* 이미 없으면 무시 */
    }
  }
}

// 이미지 저장 (jpg/jpeg/png) → 공개 경로 반환
export async function saveImage(file: File): Promise<string> {
  await ensureDirs();
  const buf = Buffer.from(await file.arrayBuffer());
  const rawExt = (file.name.split(".").pop() ?? "png").toLowerCase();
  const ext = /^(png|jpg|jpeg)$/.test(rawExt) ? rawExt : "png";
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await fs.writeFile(path.join(IMAGE_DIR, name), buf);
  return `/uploaded/${name}`;
}
