import Link from "next/link";
import { listClients, listPendingCandidates } from "@/lib/db/clients";
import { CLIENT_TYPE_BADGE, type ClientType } from "@/lib/clients-meta";
import NewClientForm from "./NewClientForm";
import MatchCandidates from "./MatchCandidates";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, pending] = await Promise.all([
    listClients(),
    listPendingCandidates(),
  ]);
  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          주거래처 마스터 · 담당자 · 주소록 · AI 매칭을 관리합니다.
        </p>
        <NewClientForm />
      </div>

      {/* AI 매칭 대기 후보 — 상담자료에서 추출된 값과 거래처 데이터 매칭 */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/40">
          <div className="px-4 py-2.5 border-b border-sky-100 text-sm font-semibold text-sky-800">
            🔎 확인 대기 중인 AI 매칭 후보 ({pending.length})
          </div>
          <MatchCandidates candidates={pending} clients={clientOptions} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold truncate">{c.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                    CLIENT_TYPE_BADGE[c.client_type as ClientType] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {c.client_type}
                </span>
              </span>
              <div className="flex items-center gap-1 text-[11px] shrink-0">
                <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
                  담당자 {c.contact_count}
                </span>
                <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
                  주소 {c.address_count}
                </span>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
              {c.business_no && <span>{c.business_no}</span>}
              {c.phone && <span>{c.phone}</span>}
              {c.default_payment_method && <span>결제 {c.default_payment_method}</span>}
              {c.default_vehicle_type && <span>차종 {c.default_vehicle_type}</span>}
            </div>
            {c.memo && <div className="mt-2 text-sm text-slate-500">{c.memo}</div>}
          </Link>
        ))}
        {clients.length === 0 && (
          <div className="text-sm text-slate-400">
            등록된 거래처가 없습니다. “새 거래처”로 추가하세요.
          </div>
        )}
      </div>
    </div>
  );
}
