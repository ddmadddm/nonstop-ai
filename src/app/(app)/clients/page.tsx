import Link from "next/link";
import {
  listManagedClients,
  listPendingCandidates,
  type ClientFilter,
  type ManagedClientRow,
} from "@/lib/db/clients";
import { CLIENT_TYPE_BADGE } from "@/lib/clients-meta";
import { formatDateTime } from "@/lib/utils";
import Pagination from "@/components/Pagination";
import NewClientForm from "./NewClientForm";

export const dynamic = "force-dynamic";

const FILTERS: { key: ClientFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "key", label: "주거래처" },
  { key: "normal", label: "일반거래처" },
  { key: "dormant", label: "휴면거래처" },
  { key: "inactive", label: "비활성" },
  { key: "info_incomplete", label: "정보미완성" },
  { key: "address_check", label: "주소확인필요" },
  { key: "fare_check", label: "요금확인필요" },
];

const SEARCH_FIELDS: { value: string; label: string }[] = [
  { value: "", label: "통합검색" },
  { value: "name", label: "거래처명" },
  { value: "manager", label: "담당자명" },
  { value: "phone", label: "연락처" },
  { value: "biz_no", label: "사업자번호" },
  { value: "region", label: "지역" },
];

const PAGE_SIZE = 10;

type SP = { filter?: string; field?: string; q?: string; page?: string };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as ClientFilter;
  const field = sp.field ?? "";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const [result, pending] = await Promise.all([
    listManagedClients({
      filter,
      q,
      field: (field || null) as never,
      page,
      pageSize: PAGE_SIZE,
    }),
    listPendingCandidates(),
  ]);

  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { filter, field, q, page: String(page), ...over };
    if (merged.filter && merged.filter !== "all") p.set("filter", merged.filter);
    if (merged.field) p.set("field", merged.field);
    if (merged.q) p.set("q", merged.q);
    if (merged.page && merged.page !== "1") p.set("page", merged.page);
    const s = p.toString();
    return s ? `/clients?${s}` : "/clients";
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">거래처 관리</h1>
        <span className="text-sm text-slate-400">Total {result.total.toLocaleString()}</span>
        <div className="ml-auto">
          <NewClientForm />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[12rem_1fr] gap-4">
        {/* 좌측 필터 패널 */}
        <aside className="rounded-xl border border-slate-200 bg-white p-2 h-fit">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400">필터</div>
          <nav className="space-y-0.5">
            {FILTERS.map((f) => {
              const active = f.key === filter;
              return (
                <Link
                  key={f.key}
                  href={qs({ filter: f.key, page: "1" })}
                  className={`block rounded-lg px-2.5 py-1.5 text-sm ${
                    active ? "bg-slate-900 text-white font-medium" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
          <div className="my-2 border-t border-slate-100" />
          <Link
            href="/prospects"
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
          >
            <span>🪪 신규 거래처 후보</span>
            {pending.length > 0 && (
              <span className="rounded-full bg-sky-600 text-white text-[10px] px-1.5">
                {pending.length}
              </span>
            )}
          </Link>
        </aside>

        {/* 우측: 검색 + 테이블 */}
        <section className="space-y-3 min-w-0">
          {/* 검색 */}
          <form method="get" className="flex flex-wrap items-center gap-2">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <select
              name="field"
              defaultValue={field}
              className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
            >
              {SEARCH_FIELDS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={q}
              placeholder="검색어"
              className="flex-1 min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2">
              검색
            </button>
            {(q || field) && (
              <Link href={qs({ q: "", field: "", page: "1" })} className="text-xs text-slate-400 underline">
                초기화
              </Link>
            )}
          </form>

          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
                  <Th>거래처명</Th>
                  <Th>구분</Th>
                  <Th>대표담당자</Th>
                  <Th>대표연락처</Th>
                  <Th>주요출발</Th>
                  <Th>주요도착</Th>
                  <Th>기본차종</Th>
                  <Th>결제</Th>
                  <Th>할인율</Th>
                  <Th>가격표기준</Th>
                  <Th>최근상담</Th>
                  <Th className="text-right">누적상담</Th>
                  <Th>AI학습률</Th>
                  <Th>상태</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.items.length === 0 && (
                  <tr>
                    <td colSpan={15} className="p-8 text-center text-sm text-slate-400">
                      조건에 맞는 거래처가 없습니다.
                    </td>
                  </tr>
                )}
                {result.items.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>

          {result.total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, result.total)} / {result.total}
              </span>
              <Pagination
                page={page}
                total={result.total}
                pageSize={PAGE_SIZE}
                hrefFor={(p) => qs({ page: String(p) })}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-2.5 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2 ${className}`}>{children ?? <span className="text-slate-300">—</span>}</td>;
}

function Row({ c }: { c: ManagedClientRow }) {
  return (
    <tr className="hover:bg-slate-50">
      <Td>
        <Link href={`/clients/${c.id}`} className="font-medium text-slate-800 hover:underline">
          {c.name}
        </Link>
      </Td>
      <Td>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${CLIENT_TYPE_BADGE[c.client_type] ?? "bg-slate-100 text-slate-600"}`}>
          {c.client_type}
        </span>
      </Td>
      <Td>{c.primary_contact}</Td>
      <Td>{c.phone}</Td>
      <Td>{c.origin_label}</Td>
      <Td>{c.destination_label}</Td>
      <Td>{c.default_vehicle_type}</Td>
      <Td>{c.default_payment_method}</Td>
      <Td>{c.default_discount_rate != null ? `${c.default_discount_rate}%` : null}</Td>
      <Td>{c.pricing_area}</Td>
      <Td>{c.last_consult_at ? formatDateTime(c.last_consult_at).slice(0, 10) : null}</Td>
      <Td className="text-right tabular-nums">{c.consult_count.toLocaleString()}</Td>
      <Td>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            c.knowledge_pct >= 100
              ? "bg-emerald-100 text-emerald-700"
              : c.knowledge_pct > 0
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {c.knowledge_pct}%
        </span>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {!c.is_active && <Flag cls="bg-zinc-200 text-zinc-600">비활성</Flag>}
          {c.info_incomplete && <Flag cls="bg-rose-100 text-rose-700">정보미완성</Flag>}
          {c.address_check && <Flag cls="bg-amber-100 text-amber-700">주소확인</Flag>}
          {c.fare_check && <Flag cls="bg-orange-100 text-orange-700">요금확인</Flag>}
          {c.is_active && !c.info_incomplete && !c.address_check && !c.fare_check && (
            <Flag cls="bg-emerald-100 text-emerald-700">정상</Flag>
          )}
        </div>
      </Td>
      <Td>
        <Link
          href={`/clients/${c.id}`}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
        >
          상세
        </Link>
      </Td>
    </tr>
  );
}

function Flag({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${cls}`}>{children}</span>;
}
