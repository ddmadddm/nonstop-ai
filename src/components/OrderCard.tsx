import type { Dispatch, Order } from "@/lib/types";
import { DispatchBadge } from "@/components/badges";
import { formatWon } from "@/lib/utils";

const STOP_LABEL: Record<string, string> = {
  pickup: "출발",
  via: "경유",
  dropoff: "도착",
};
const STOP_COLOR: Record<string, string> = {
  pickup: "bg-blue-500",
  via: "bg-amber-500",
  dropoff: "bg-rose-500",
};

export function OrderCard({ order }: { order: Order }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold">📦 오더 정보</span>
        <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
          {order.requestType}
          {order.desiredTime ? ` · ${order.desiredTime}` : ""}
        </span>
        <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
          {order.vehicleType}
        </span>
      </div>

      <ol className="space-y-0">
        {order.stops.map((s, i) => (
          <li key={s.seq} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${STOP_COLOR[s.type]}`}
              />
              {i < order.stops.length - 1 && (
                <span className="w-px flex-1 bg-slate-200 my-1" />
              )}
            </div>
            <div className="pb-3 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-slate-400">
                  {STOP_LABEL[s.type]}
                </span>
                {s.name && <span className="text-sm font-medium">{s.name}</span>}
                {s.qty && (
                  <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                    {s.qty}
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-600">{s.address}</div>
              {s.phone && (
                <div className="text-xs text-slate-400">{s.phone}</div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {(order.item || order.note || order.viaOrderFixed === false) && (
        <div className="border-t border-slate-100 pt-3 mt-1 space-y-1 text-sm">
          {order.item && (
            <div>
              <span className="text-slate-400">물품 </span>
              {order.item}
            </div>
          )}
          {order.viaOrderFixed === false && (
            <div>
              <span className="text-slate-400">경유 </span>순서 무관 (코스 자유)
            </div>
          )}
          {order.note && (
            <div>
              <span className="text-slate-400">특이 </span>
              {order.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DispatchCard({ dispatch }: { dispatch: Dispatch }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold">🚚 배차 정보</span>
        <DispatchBadge status={dispatch.status} />
      </div>
      <dl className="grid grid-cols-3 gap-y-2 text-sm">
        <dt className="text-slate-400">기사</dt>
        <dd className="col-span-2 font-medium">{dispatch.driverName}</dd>
        <dt className="text-slate-400">연락처</dt>
        <dd className="col-span-2">{dispatch.driverPhone}</dd>
        {dispatch.vehicleNo && (
          <>
            <dt className="text-slate-400">차량</dt>
            <dd className="col-span-2">
              {dispatch.vehicleNo} · {dispatch.vehicleType}
            </dd>
          </>
        )}
        <dt className="text-slate-400">운임</dt>
        <dd className="col-span-2 font-semibold text-emerald-700">
          {formatWon(dispatch.fare)}
          {dispatch.fare != null && (
            <span className="text-xs font-normal text-slate-400"> (공급가)</span>
          )}
        </dd>
      </dl>
    </div>
  );
}
