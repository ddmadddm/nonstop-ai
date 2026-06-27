"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveAddressesAction, type ActionResult } from "../extraction-actions";
import type { ExtractionAddresses, SideAddress } from "@/lib/db/addresses";

const KIND_LABEL: Record<string, string> = {
  road: "신주소(도로명)",
  jibun: "구주소(지번)",
  area: "동/읍/면",
  incomplete: "불완전",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  resolved: { label: "변환완료", cls: "bg-emerald-100 text-emerald-700" },
  needs_review: { label: "직원 확인 필요", cls: "bg-rose-100 text-rose-700 font-medium" },
  failed: { label: "변환실패", cls: "bg-rose-100 text-rose-700" },
  pending: { label: "대기", cls: "bg-slate-100 text-slate-600" },
};

export default function AddressConversionCard({
  conversationId,
  addresses,
}: {
  conversationId: string;
  addresses: ExtractionAddresses | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function resolve() {
    startTransition(async () => {
      const r = await resolveAddressesAction(conversationId);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  const hasInput = Boolean(addresses?.origin.raw || addresses?.destination.raw);
  const status = addresses?.status ?? null;
  const meta = status ? STATUS_META[status] : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
        <span className="text-sm font-semibold">주소 변환 (신주소 ↔ 구주소 · 가격표 기준)</span>
        {meta && <span className={`text-[11px] rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>}
        {addresses?.confidence != null && (
          <span className="text-[11px] text-slate-400">변환 신뢰도 {Math.round(addresses.confidence * 100)}%</span>
        )}
        <button
          onClick={resolve}
          disabled={pending}
          className="ml-auto rounded-lg border border-slate-300 text-xs font-medium px-3 py-1.5 disabled:opacity-50 hover:bg-slate-50"
        >
          {pending ? "변환 중…" : status ? "주소 재변환" : "주소 변환"}
        </button>
      </div>

      {!hasInput ? (
        <div className="p-4 text-sm text-slate-400">
          변환할 출발지/도착지가 없습니다. AI 추출 후 “주소 변환”을 실행하세요.
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Side title="출발지" s={addresses!.origin} />
            <Side title="도착지" s={addresses!.destination} />
          </div>

          {/* 고객 답변(신주소) vs 직원 확인(구주소·가격표) */}
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 text-xs">
              <div className="font-semibold text-sky-800 mb-1">고객 답변용 (신주소)</div>
              <div className="text-slate-700">
                {pick(addresses!.origin, "road") ?? "—"} →{" "}
                {pick(addresses!.destination, "road") ?? "—"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="font-semibold text-slate-700 mb-1">직원 확인용 (구주소 · 가격표 기준)</div>
              <div className="text-slate-600 space-y-0.5">
                <div>출발 구주소: {addresses!.origin.jibun_address ?? "—"}</div>
                <div>도착 구주소: {addresses!.destination.jibun_address ?? "—"}</div>
                <div className="text-slate-500">
                  가격표 기준: {addresses!.origin.pricing_area ?? "—"} →{" "}
                  {addresses!.destination.pricing_area ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {status === "needs_review" && (
            <p className="text-[11px] text-rose-600">
              ※ 변환 신뢰도가 낮습니다. 가격표 적용 전 구주소/기준 지역을 직원이 확인하세요.
            </p>
          )}
          {result && (
            <p className={`text-xs ${result.ok ? "text-emerald-600" : "text-rose-600"}`}>{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function pick(s: SideAddress, key: "road"): string | null {
  return key === "road" ? s.road_address ?? s.raw : s.raw;
}

function Side({ title, s }: { title: string; s: SideAddress }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-semibold">{title}</span>
        {s.kind && (
          <span className="text-[11px] rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">
            {KIND_LABEL[s.kind] ?? s.kind}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1 text-xs">
        <Row label="원문 주소" v={s.raw} />
        <Row label="신주소" v={s.road_address} />
        <Row label="변환 구주소" v={s.jibun_address} />
        <Row label="가격표 기준" v={s.pricing_area} />
      </dl>
    </div>
  );
}

function Row({ label, v }: { label: string; v: string | null }) {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-700 break-words">{v ?? "—"}</dd>
    </>
  );
}
