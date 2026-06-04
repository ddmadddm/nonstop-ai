/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getClients } from "@/lib/data";
import { getConsultations } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { removeConsultation } from "./actions";
import UploadForm from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  const [list, clients] = await Promise.all([
    getConsultations(),
    getClients(),
  ]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <p className="text-sm text-slate-500">
          기존 카카오 상담 캡처와 원문을 업로드하면{" "}
          <code>consultations</code> 테이블에 누적 저장됩니다. 거래처·담당자·
          상담유형·상담내용은 향후 AI 학습/분석에 사용됩니다.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          ※ 상담내용은 <b>원문 그대로</b> 저장(AI 가공 없음), 이미지 경로는
          원문과 분리 저장 → 추후 OpenAI OCR/분석 연동 대비. 현재는 로컬 파일
          DB(<code>.data/consultations.json</code>)이며 Supabase로 이전 가능.
        </p>
      </div>

      <UploadForm
        clientNames={clients.map((c) => c.name)}
        defaultCreatedBy="오현미"
      />

      <section>
        <h2 className="text-sm font-semibold mb-2">
          저장된 상담자료{" "}
          <span className="text-slate-400">({list.length}건)</span>
          <Link
            href="/conversations"
            className="ml-2 text-xs font-normal text-slate-500 underline hover:text-slate-900"
          >
            상담관리에서 보기 →
          </Link>
        </h2>

        {list.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            아직 저장된 자료가 없습니다. 위에서 첫 자료를 올려보세요.
          </div>
        )}

        <div className="space-y-3">
          {list.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center gap-2 flex-wrap text-sm">
                {c.client_name && (
                  <span className="font-medium">{c.client_name}</span>
                )}
                {c.manager_name && (
                  <span className="text-slate-500">/ {c.manager_name}</span>
                )}
                {c.consultation_type && (
                  <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">
                    {c.consultation_type}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {c.created_by ? `${c.created_by} · ` : ""}
                  {formatDateTime(c.created_at)}
                </span>
                <form action={removeConsultation}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className="text-xs text-slate-400 hover:text-rose-600"
                  >
                    삭제
                  </button>
                </form>
              </div>

              {c.consultation_content_original && (
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
                  {c.consultation_content_original}
                </pre>
              )}

              {c.image_urls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.image_urls.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      <img
                        src={src}
                        alt="상담 캡처"
                        className="h-32 rounded-lg border border-slate-200 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
