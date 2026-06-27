// 거래처 문서 다운로드 — 보관된 원본을 스트리밍한다.
//   주의: /api 는 인증 미들웨어 제외 경로. 내부망 ERP MVP 기준. 외부 공개 전 접근제어 보강 필요.
import { NextRequest, NextResponse } from "next/server";
import { getDocumentFile } from "@/lib/db/client-records";
import { readOriginalFile } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const doc = await getDocumentFile(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const buf = await readOriginalFile(doc.stored_path);
    const name = encodeURIComponent(doc.filename);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mime ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
