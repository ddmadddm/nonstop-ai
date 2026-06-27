// 주소 변환 표시 카드(읽기 전용) — 논사원 답변/상담 화면 공용.
//   고객 답변용(신주소) vs 직원 확인용(구주소·가격표 기준)을 분리해 보여준다.
//   훅 없는 순수 컴포넌트라 서버/클라이언트 양쪽에서 사용 가능.
import type { ExtractionAddresses, SideAddress } from "@/lib/db/addresses";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  resolved: { label: "변환완료", cls: "bg-emerald-100 text-emerald-700" },
  needs_review: { label: "직원 확인 필요", cls: "bg-rose-100 text-rose-700 font-medium" },
  failed: { label: "변환실패", cls: "bg-rose-100 text-rose-700" },
  pending: { label: "대기", cls: "bg-slate-100 text-slate-600" },
};

function road(s: SideAddress): string {
  return s.road_address ?? s.raw ?? "—";
}

export default function AddressInternalCard({
  addresses,
}: {
  addresses: ExtractionAddresses | null;
}) {
  if (!addresses || (!addresses.origin.raw && !addresses.destination.raw)) return null;
  const o = addresses.origin;
  const d = addresses.destination;
  const meta = addresses.status ? STATUS_META[addresses.status] : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold">주소 변환 (가격표 기준 지역)</span>
        {meta && <span className={`text-[11px] rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>}
        {addresses.confidence != null && (
          <span className="text-[11px] text-slate-400">변환 신뢰도 {Math.round(addresses.confidence * 100)}%</span>
        )}
      </div>
      <div className="p-4 grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 text-xs">
          <div className="font-semibold text-sky-800 mb-1">고객 답변용 (신주소)</div>
          <div className="text-slate-700">
            {road(o)} → {road(d)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="font-semibold text-slate-700 mb-1">직원 확인용 (구주소 · 가격표 기준)</div>
          <div className="text-slate-600 space-y-0.5">
            <div>출발 구주소: {o.jibun_address ?? "—"}</div>
            <div>도착 구주소: {d.jibun_address ?? "—"}</div>
            <div className="text-slate-500">
              가격표 기준: {o.pricing_area ?? "—"} → {d.pricing_area ?? "—"}
            </div>
          </div>
        </div>
      </div>
      {addresses.status === "needs_review" && (
        <p className="px-4 pb-3 -mt-1 text-[11px] text-rose-600">
          ※ 변환 신뢰도가 낮습니다. 운임 적용 전 구주소/기준 지역을 직원이 확인하세요.
        </p>
      )}
    </div>
  );
}
