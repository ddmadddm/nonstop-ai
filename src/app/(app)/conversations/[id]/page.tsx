/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import AiDraftPanel from "@/components/AiDraftPanel";
import { CategoryBadge, StatusBadge } from "@/components/badges";
import { DispatchCard, OrderCard } from "@/components/OrderCard";
import { getClient, getConversation, getFaqsByIds } from "@/lib/data";
import { getConsultation } from "@/lib/db/consultations";
import type { Consultation } from "@/lib/db/consultations";
import { sql } from "@/lib/db/client";
import { getExtraction, type Extraction } from "@/lib/db/extractions";
import { getExtractionAddresses, type ExtractionAddresses } from "@/lib/db/addresses";
import AddressInternalCard from "@/components/AddressInternalCard";
import type { Message } from "@/lib/types";
import { cx, formatDateTime, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

// 실제 추출 대화(상담자료 업로드로 생성된 conversation) 조회 — 목업에 없을 때 폴백.
async function getRealConversation(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return null; // UUID 형태만 시도
  const [c] = await sql<{ id: string; title: string | null; message_count: number }[]>`
    select id, title, message_count from conversations
    where id = ${id} and is_active and source_system in ('chatlog','material')`;
  return c ?? null;
}

function Bubble({ m }: { m: Message }) {
  const isCustomer = m.sender === "customer";
  return (
    <div className={cx("flex flex-col", isCustomer ? "items-start" : "items-end")}>
      {!isCustomer && m.agentName && (
        <span className="text-[11px] text-slate-400 mb-0.5 mr-1">
          {m.agentName}
        </span>
      )}
      <div className={cx("flex items-end gap-1.5 max-w-[85%]", isCustomer ? "" : "flex-row-reverse")}>
        <div
          className={cx(
            "rounded-2xl px-3 py-2 text-sm preline",
            isCustomer
              ? "bg-white border border-slate-200 rounded-tl-sm"
              : "bg-yellow-300 text-slate-900 rounded-tr-sm",
          )}
        >
          {m.attachments?.map((a, i) => (
            <div
              key={i}
              className="mb-1 inline-flex items-center gap-1 rounded bg-black/5 px-2 py-1 text-xs text-slate-600"
            >
              🗺️ {a.label ?? "첨부"}
            </div>
          ))}
          {m.text && <div className="whitespace-pre-line">{m.text}</div>}
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">
          {formatTime(m.sentAt)}
        </span>
      </div>
    </div>
  );
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 업로드된 상담자료는 원문/이미지 전용 화면으로 렌더링
  if (id.startsWith("up_")) {
    const c = await getConsultation(id.slice(3));
    if (!c) notFound();
    return <UploadedDetail c={c} />;
  }

  const cv = await getConversation(id);
  if (!cv) {
    // 목업에 없으면 실제 추출 대화(상담자료)일 수 있다 → 추출/주소변환을 불러와 표시.
    const real = await getRealConversation(id);
    if (real) {
      const [extraction, addresses] = await Promise.all([
        getExtraction(id),
        getExtractionAddresses(id),
      ]);
      return <RealConversationDetail conv={real} extraction={extraction} addresses={addresses} />;
    }
    notFound();
  }

  const [client, draftFaqs] = await Promise.all([
    getClient(cv.clientId),
    cv.aiDraft ? getFaqsByIds(cv.aiDraft.usedFaqIds) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* 헤더 */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/conversations" className="text-slate-400 hover:text-slate-900">
            ←
          </Link>
          <span className="font-semibold">{cv.title}</span>
          {client && (
            <Link
              href={`/clients/${client.id}`}
              className="text-xs text-slate-500 underline hover:text-slate-900"
            >
              {client.name}
            </Link>
          )}
          <CategoryBadge categoryKey={cv.categoryKey} />
          <StatusBadge status={cv.status} />
          {cv.assignedAgent && (
            <span className="ml-auto text-xs text-slate-400">
              담당 {cv.assignedAgent}
            </span>
          )}
        </div>
      </div>

      {/* 본문: 스레드 + 컨텍스트 */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_22rem] overflow-hidden">
        {/* 메시지 스레드 */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-3 bg-slate-100">
          {cv.messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
        </div>

        {/* 컨텍스트 패널 */}
        <aside className="overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 p-4 space-y-4">
          {cv.order && <OrderCard order={cv.order} />}
          {cv.dispatch && <DispatchCard dispatch={cv.dispatch} />}
          {cv.aiDraft && (
            <AiDraftPanel
              initialText={cv.aiDraft.text}
              confidence={cv.aiDraft.confidence}
              faqs={draftFaqs.map((f) => ({ id: f.id, question: f.question }))}
            />
          )}
          {!cv.aiDraft && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
              이 상담에는 AI 초안이 아직 없습니다.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-16 shrink-0 text-slate-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// 실제 추출 대화 상세 — 배차 항목 요약 + 주소 변환 카드. 전체 편집은 /chatlogs/[id].
function RealConversationDetail({
  conv,
  extraction,
  addresses,
}: {
  conv: { id: string; title: string | null; message_count: number };
  extraction: Extraction | null;
  addresses: ExtractionAddresses | null;
}) {
  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/conversations" className="text-slate-400 hover:text-slate-900">
          ←
        </Link>
        <span className="font-semibold">{conv.title ?? "상담"}</span>
        <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs">AI 추출 상담</span>
        <Link
          href={`/chatlogs/${conv.id}`}
          className="ml-auto text-xs text-slate-500 underline hover:text-slate-900"
        >
          원본·추출 상세 →
        </Link>
      </div>

      {extraction ? (
        <dl className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <Field label="거래처" value={extraction.client_name ?? undefined} />
          <Field label="담당자" value={extraction.manager_name ?? undefined} />
          <Field label="연락처" value={extraction.phone ?? undefined} />
          <Field label="출발지" value={extraction.origin ?? undefined} />
          <Field label="도착지" value={extraction.destination ?? undefined} />
          <Field label="차량종류" value={extraction.vehicle_type ?? undefined} />
          <Field label="상담유형" value={extraction.consultation_type ?? undefined} />
        </dl>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
          아직 AI 추출 결과가 없습니다. 상담자료 상세에서 추출을 실행하세요.
        </div>
      )}

      {/* 주소 변환(신/구 + 가격표 기준) — 직원 확인용 */}
      <AddressInternalCard addresses={addresses} />
    </div>
  );
}

function UploadedDetail({ c }: { c: Consultation }) {
  const title =
    [c.client_name, c.manager_name].filter(Boolean).join(" / ") ||
    "업로드 상담자료";
  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/conversations" className="text-slate-400 hover:text-slate-900">
          ←
        </Link>
        <span className="font-semibold">{title}</span>
        {c.consultation_type && (
          <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">
            {c.consultation_type}
          </span>
        )}
        <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs">
          업로드 자료
        </span>
      </div>

      <dl className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
        <Field label="거래처" value={c.client_name} />
        <Field label="담당자" value={c.manager_name} />
        <Field label="상담유형" value={c.consultation_type} />
        <Field label="등록자" value={c.created_by} />
        <Field label="등록일" value={formatDateTime(c.created_at)} />
      </dl>

      {c.consultation_content_original && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold mb-2">상담내용 (원문)</div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
            {c.consultation_content_original}
          </pre>
        </div>
      )}

      {c.image_urls.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold mb-2">
            상담 캡처 ({c.image_urls.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {c.image_urls.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer">
                <img
                  src={src}
                  alt="상담 캡처"
                  className="h-48 rounded-lg border border-slate-200 object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
