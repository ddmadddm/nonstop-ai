/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { listMaterials, getMaterialStats } from "@/lib/db/materials";
import { getTrainingStats } from "@/lib/db/training";
import { getConsultations } from "@/lib/db/consultations";
import { getClients } from "@/lib/data";
import { getActorName } from "@/lib/auth";
import { displayStatus, STATUS_META } from "@/lib/materials-status";
import { formatDateTime } from "@/lib/utils";
import MaterialUploadForm from "./MaterialUploadForm";
import DeleteMaterialButton from "./DeleteMaterialButton";
import ReconvertMaterialButton from "./ReconvertMaterialButton";
import ConsultationInputForm from "./ConsultationInputForm";
import { removeConsultation } from "./consultation-actions";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = { chat: "🗂️", audio: "🎙️", image: "🖼️", pdf: "📄" };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export default async function MaterialsPage() {
  const [stats, training, materials, consultations, clients, actorName] = await Promise.all([
    getMaterialStats(),
    getTrainingStats(),
    listMaterials(),
    getConsultations(),
    getClients(),
    getActorName(),
  ]);
  const createdBy = actorName ?? "";

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <p className="text-sm text-slate-500">
          상담자료를 <b>파일 업로드</b> 또는 <b>직접 입력</b>으로 기록합니다. 파일은 종류를 자동
          판별해 텍스트로 변환하고 AI가 8개 항목을 추출합니다:
          <code> CSV·XLSX</code>(메시지 파싱) · <code>WAV·MP3·M4A</code>(음성→STT) ·{" "}
          <code>PNG·JPG·PDF</code>(이미지→OCR).
        </p>
        <p className="text-xs text-slate-400 mt-1">
          ※ 원본 파일은 그대로 보관되고, 변환 결과도 저장됩니다. 변환에 실패해도 원본은
          보존되며 상태가 <b>변환실패</b>로 기록됩니다.
        </p>
      </div>

      <h2 className="text-sm font-semibold">📁 파일 업로드</h2>
      <MaterialUploadForm defaultCreatedBy={createdBy} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="업로드 자료" value={stats.total} />
        <Stat label="변환중" value={stats.converting} />
        <Stat label="변환실패" value={stats.failed} />
        <Stat label="확정" value={stats.confirmed} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-6 text-sm">
        <span className="font-semibold">🧠 AI 학습 데이터</span>
        <span className="text-amber-700">
          후보 <b className="tabular-nums">{training.candidates.toLocaleString()}</b>
        </span>
        <span className="text-emerald-700">
          승격(확정) <b className="tabular-nums">{training.confirmed.toLocaleString()}</b>
        </span>
        <span className="text-slate-400 text-xs ml-auto">
          확정한 데이터만 학습에 사용됩니다(원본은 별도 보관).
        </span>
      </div>

      <section>
        <h2 className="text-sm font-semibold mb-2">
          상담자료 <span className="text-slate-400">({materials.length}건)</span>
        </h2>
        {materials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            업로드된 자료가 없습니다.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {materials.map((m) => {
              const ds = displayStatus(m);
              const meta = STATUS_META[ds];
              const inner = (
                <>
                  <span className="text-base shrink-0">{KIND_ICON[m.kind] ?? "📎"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.filename}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      <span className="uppercase">{m.file_type}</span>
                      {m.created_by_name ? ` · ${m.created_by_name}` : ""}
                      {` · ${formatDateTime(m.created_at)}`}
                      {ds === "convert_failed" && m.conversion_error
                        ? ` · ${m.conversion_error}`
                        : ""}
                    </div>
                  </div>
                  {m.is_urgent && (
                    <span className="text-xs rounded-full bg-rose-100 text-rose-700 px-2 py-0.5">긴급</span>
                  )}
                  <span className={`text-xs rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                </>
              );
              return (
                <div key={m.id} className="flex items-center hover:bg-slate-50">
                  {m.conversation_id ? (
                    <Link
                      href={`/chatlogs/${m.conversation_id}`}
                      className="flex items-center gap-3 p-3.5 flex-1 min-w-0"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 p-3.5 flex-1 min-w-0">
                      {inner}
                    </div>
                  )}
                  <div className="pr-2 flex items-center">
                    {ds === "convert_failed" && (
                      <ReconvertMaterialButton materialId={m.id} filename={m.filename} />
                    )}
                    <DeleteMaterialButton materialId={m.id} filename={m.filename} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 직접 입력(원문/캡처) — 구 "자료 업로드" 통합 ───────────────── */}
      <section className="border-t border-slate-200 pt-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">✍️ 직접 입력 (원문·캡처)</h2>
          <p className="text-xs text-slate-400 mt-1">
            카카오 상담 원문이나 캡처 이미지를 직접 붙여넣어 기록합니다. 상담내용은{" "}
            <b>원문 그대로</b> 저장(AI 가공 없음)되고, &ldquo;비활성화&rdquo;는 물리삭제가 아니라
            데이터 보존 처리입니다.
          </p>
        </div>

        <ConsultationInputForm
          clientNames={clients.map((c) => c.name)}
          defaultCreatedBy={createdBy}
        />

        <div>
          <h3 className="text-sm font-semibold mb-2">
            직접 입력한 상담자료{" "}
            <span className="text-slate-400">({consultations.length}건)</span>
            <Link
              href="/conversations"
              className="ml-2 text-xs font-normal text-slate-500 underline hover:text-slate-900"
            >
              상담관리에서 보기 →
            </Link>
          </h3>

          {consultations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              아직 직접 입력한 자료가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {consultations.map((c) => (
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
                        title="물리삭제가 아닌 비활성화(데이터 보존)"
                      >
                        비활성화
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
          )}
        </div>
      </section>
    </div>
  );
}
