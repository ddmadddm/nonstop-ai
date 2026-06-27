"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Client,
  ClientContact,
  ClientAddress,
  ClientConsultation,
  MatchCandidate,
} from "@/lib/db/clients";
import type { ClientKnowledge } from "@/lib/db/knowledge";
import type { PricingPolicy, ClientRule } from "@/lib/db/client-policy";
import type { ClientDraft } from "@/lib/db/assistant";
import {
  CLIENT_TYPES,
  PAYMENT_METHODS,
  CONTACT_ROLES,
  ADDRESS_CATEGORIES,
  ADDRESS_VERIFY,
  VEHICLE_TYPES,
  RULE_TYPES,
} from "@/lib/clients-meta";
import MatchCandidates from "../MatchCandidates";
import {
  updateClientAction,
  createContactAction,
  updateContactAction,
  deactivateContactAction,
  createAddressAction,
  updateAddressAction,
  deactivateAddressAction,
  setDefaultOriginAction,
  buildClientKnowledgeAction,
  addAddressFromKnowledgeAction,
  savePricingAction,
  createRuleAction,
  updateRuleAction,
  deactivateRuleAction,
  type ActionResult,
} from "../actions";

const USAGE_LABEL: Record<string, string> = {
  origin: "출발지",
  destination: "도착지",
  both: "출발/도착",
};

type TabKey = "billing" | "contacts" | "addresses" | "pricing" | "rules" | "history" | "match" | "knowledge";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const labelCls = "block text-sm";
const subLabel = "text-slate-500";

function Msg({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <span className={`text-xs ${result.ok ? "text-emerald-600" : "text-rose-600"}`}>
      {result.message}
    </span>
  );
}

export default function ClientDetail({
  client,
  contacts,
  addresses,
  consultations,
  candidates,
  clientOptions,
  knowledge,
  pricing,
  rules,
  drafts,
}: {
  client: Client;
  contacts: ClientContact[];
  addresses: ClientAddress[];
  consultations: ClientConsultation[];
  candidates: MatchCandidate[];
  clientOptions: { id: string; name: string }[];
  knowledge: ClientKnowledge | null;
  pricing: PricingPolicy | null;
  rules: ClientRule[];
  drafts: ClientDraft[];
}) {
  const pendingCount = candidates.filter((c) => c.status === "pending").length;
  const TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: "billing", label: "기본정보" },
    { key: "contacts", label: `담당자 ${contacts.length}` },
    { key: "addresses", label: `주소록 ${addresses.length}` },
    { key: "pricing", label: "운임·요금" },
    { key: "rules", label: `AI 업무규칙 ${rules.length}` },
    { key: "history", label: `상담이력 ${consultations.length + drafts.length}` },
    { key: "match", label: "AI 매칭", badge: pendingCount },
    { key: "knowledge", label: "지식베이스" },
  ];
  const [tab, setTab] = useState<TabKey>("billing");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-3 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 ${
              tab === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-sky-600 text-white text-[10px] px-1.5 h-4">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "billing" && <BillingTab client={client} addresses={addresses} />}
      {tab === "contacts" && <ContactsTab clientId={client.id} contacts={contacts} />}
      {tab === "addresses" && (
        <AddressesTab
          client={client}
          addresses={addresses}
        />
      )}
      {tab === "pricing" && <PricingTab clientId={client.id} pricing={pricing} />}
      {tab === "rules" && <RulesTab clientId={client.id} rules={rules} />}
      {tab === "history" && <HistoryTab consultations={consultations} drafts={drafts} />}
      {tab === "match" && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold">
            AI 매칭 후보
          </div>
          <MatchCandidates
            candidates={candidates}
            clients={clientOptions}
            emptyText="이 거래처로 추천된 매칭 후보가 없습니다. 상담자료 화면에서 '거래처 매칭'을 실행하세요."
          />
        </div>
      )}
      {tab === "knowledge" && <KnowledgeTab clientId={client.id} knowledge={knowledge} />}
    </div>
  );
}

// ── ⑦ 지식베이스 ─────────────────────────────────────────────────────
function KnowledgeTab({
  clientId,
  knowledge,
}: {
  clientId: string;
  knowledge: ClientKnowledge | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [addResult, setAddResult] = useState<ActionResult | null>(null);

  function build() {
    startTransition(async () => {
      const r = await buildClientKnowledgeAction(clientId);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }
  function addAddress(label: string, address: string, usage: "origin" | "destination") {
    startTransition(async () => {
      const r = await addAddressFromKnowledgeAction(clientId, label, address, usage);
      setAddResult(r);
      if (r.ok) router.refresh();
    });
  }

  const k = knowledge;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">거래처 지식베이스</span>
          {k && (
            <span className="text-xs text-slate-400">
              상담 {k.source_count ?? k.total}건 집계
              {k.updated_at ? ` · ${k.updated_at.slice(0, 10)} 갱신` : ""}
            </span>
          )}
          <button
            onClick={build}
            disabled={pending}
            className="ml-auto rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {pending ? "구축 중…" : k ? "갱신" : "지식베이스 구축"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          분리된 상담 단위의 AI 추출/매칭 결과를 집계합니다. 이 거래처로 지정된 채팅방 또는 매칭된
          상담이 대상입니다.
        </p>
        <Msg result={result} />
      </div>

      {!k || k.total === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          아직 집계된 지식이 없습니다. 상담자료(원본 자료실)에서 이 거래처로 지정·추출 후 “구축”을 누르세요.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <KFreq
            title="자주 쓰는 출발지"
            items={k.origins}
            onAdd={(v) => addAddress(v, v, "origin")}
          />
          <KFreq
            title="자주 쓰는 도착지"
            items={k.destinations}
            onAdd={(v) => addAddress(v, v, "destination")}
          />
          <KSimple title="자주 쓰는 차종" items={k.vehicles} />
          <KSimple title="상담유형" items={k.consultation_types} />
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
            <div className="text-sm font-semibold mb-2">담당자</div>
            {k.managers.length === 0 ? (
              <p className="text-xs text-slate-400">없음</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {k.managers.map((m, i) => (
                  <span key={i} className="text-xs rounded-full bg-slate-100 px-2 py-0.5">
                    {m.name ?? "(이름없음)"}
                    {m.phone ? ` · ${m.phone}` : ""}
                    <span className="text-slate-400"> {m.count}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs text-slate-400">
              긴급 비중 {k.total > 0 ? Math.round((k.urgent / k.total) * 100) : 0}% · 집계 상담{" "}
              {k.total}건
            </div>
          </div>
        </div>
      )}
      <Msg result={addResult} />
    </div>
  );
}

function KFreq({
  title,
  items,
  onAdd,
}: {
  title: string;
  items: { value: string; count: number }[];
  onAdd: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">없음</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{it.value}</span>
              <span className="text-xs text-slate-400">{it.count}</span>
              <button
                onClick={() => onAdd(it.value)}
                className="text-xs text-sky-600 hover:text-sky-800 shrink-0"
                title="주소록에 추가"
              >
                + 주소록
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KSimple({ title, items }: { title: string; items: { value: string; count: number }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">없음</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <span key={i} className="text-xs rounded-full bg-slate-100 px-2 py-0.5">
              {it.value}
              <span className="text-slate-400"> {it.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 요금·결제(거래처 기본정보 수정) ──────────────────────────────────
function BillingTab({
  client,
  addresses,
}: {
  client: Client;
  addresses: ClientAddress[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function save(fd: FormData) {
    startTransition(async () => {
      const r = await updateClientAction(client.id, fd);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <form
      action={save}
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={labelCls}>
          <span className={subLabel}>거래처명 *</span>
          <input name="name" required defaultValue={client.name} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>거래처 유형</span>
          <select
            name="client_type"
            defaultValue={client.client_type}
            className={`mt-1 ${input} bg-white`}
          >
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className={subLabel}>사업자번호</span>
          <input name="business_no" defaultValue={client.business_no ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>대표자명</span>
          <input name="ceo_name" defaultValue={client.ceo_name ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>대표 연락처</span>
          <input name="phone" defaultValue={client.phone ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>이메일</span>
          <input name="email" defaultValue={client.email ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>거래시작일</span>
          <input type="date" name="started_on" defaultValue={client.started_on ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>기본 할인율(%)</span>
          <input
            type="number"
            step="0.1"
            name="default_discount_rate"
            defaultValue={client.default_discount_rate ?? ""}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>기본 결제방식</span>
          <select
            name="default_payment_method"
            defaultValue={client.default_payment_method ?? ""}
            className={`mt-1 ${input} bg-white`}
          >
            <option value="">선택</option>
            {PAYMENT_METHODS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className={subLabel}>기본 차종</span>
          <input
            name="default_vehicle_type"
            defaultValue={client.default_vehicle_type ?? ""}
            placeholder="다마스 / 오토바이 …"
            className={`mt-1 ${input}`}
          />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>자주 쓰는 차종(쉼표 구분)</span>
          <input
            name="frequent_vehicle_types"
            defaultValue={client.frequent_vehicle_types.join(", ")}
            placeholder="다마스, 1톤"
            className={`mt-1 ${input}`}
          />
        </label>
      </div>
      <label className={labelCls}>
        <span className={subLabel}>주소(대표)</span>
        <input name="address" defaultValue={client.address ?? ""} className={`mt-1 ${input}`} />
      </label>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="tax_invoice" defaultChecked={client.tax_invoice} />
          <span>세금계산서 발행</span>
        </label>
      </div>
      <label className={labelCls}>
        <span className={subLabel}>요금조건</span>
        <input name="fare_terms" defaultValue={client.fare_terms ?? ""} className={`mt-1 ${input}`} />
      </label>
      <label className={labelCls}>
        <span className={subLabel}>특이사항 메모</span>
        <textarea name="memo" rows={2} defaultValue={client.memo ?? ""} className={`mt-1 ${input}`} />
      </label>
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        기본 출발지:{" "}
        <span className="font-medium text-slate-700">
          {client.default_origin_label ?? "미설정"}
        </span>
        {addresses.length > 0 && " · 주소록 탭에서 변경할 수 있습니다."}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <Msg result={result} />
      </div>
    </form>
  );
}

// ── 담당자 ───────────────────────────────────────────────────────────
function ContactsTab({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ClientContact[];
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {contacts.length === 0 && (
          <div className="p-4 text-sm text-slate-400">등록된 담당자가 없습니다.</div>
        )}
        {contacts.map((c) => (
          <ContactItem key={c.id} clientId={clientId} contact={c} />
        ))}
      </div>
      <ContactForm clientId={clientId} />
    </div>
  );
}

function ContactItem({
  clientId,
  contact,
}: {
  clientId: string;
  contact: ClientContact;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function del() {
    if (!confirm(`담당자 '${contact.name}'을(를) 삭제(비활성화)할까요?`)) return;
    startTransition(async () => {
      const r = await deactivateContactAction(contact.id, clientId);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  if (edit) {
    return (
      <div className="p-3">
        <ContactForm
          clientId={clientId}
          contact={contact}
          onDone={() => setEdit(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{contact.name}</span>
          {contact.is_primary && (
            <span className="text-[11px] rounded-full bg-violet-100 text-violet-700 px-2 py-0.5">
              주담당
            </span>
          )}
          {(contact.department || contact.title) && (
            <span className="text-xs text-slate-400">
              {[contact.department, contact.title].filter(Boolean).join(" ")}
            </span>
          )}
          {contact.role && (
            <span className="text-[11px] rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5">
              {contact.role}
            </span>
          )}
          {contact.is_resigned && (
            <span className="text-[11px] rounded-full bg-zinc-200 text-zinc-600 px-2 py-0.5">퇴사</span>
          )}
          {contact.kakao_display_name && (
            <span className="text-[11px] rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
              카톡 {contact.kakao_display_name}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {[contact.phone, contact.email].filter(Boolean).join(" · ")}
          {contact.memo ? ` · ${contact.memo}` : ""}
        </div>
      </div>
      <Msg result={result} />
      <button
        onClick={() => setEdit(true)}
        className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
      >
        수정
      </button>
      <button
        onClick={del}
        disabled={pending}
        className="text-xs text-rose-500 hover:text-rose-700 px-2 py-1 disabled:opacity-50"
      >
        삭제
      </button>
    </div>
  );
}

function ContactForm({
  clientId,
  contact,
  onDone,
}: {
  clientId: string;
  contact?: ClientContact;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(fd: FormData) {
    startTransition(async () => {
      const r = contact
        ? await updateContactAction(contact.id, clientId, fd)
        : await createContactAction(clientId, fd);
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone?.();
        if (!contact) (document.getElementById(`cform-${clientId}`) as HTMLFormElement)?.reset();
      }
    });
  }

  return (
    <form
      id={contact ? undefined : `cform-${clientId}`}
      action={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    >
      {!contact && <div className="text-sm font-semibold">담당자 추가</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={labelCls}>
          <span className={subLabel}>담당자명 *</span>
          <input name="name" required defaultValue={contact?.name ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>부서</span>
          <input name="department" defaultValue={contact?.department ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>직급</span>
          <input name="title" defaultValue={contact?.title ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>역할</span>
          <select name="role" defaultValue={contact?.role ?? ""} className={`mt-1 ${input} bg-white`}>
            <option value="">선택</option>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className={subLabel}>연락처</span>
          <input name="phone" defaultValue={contact?.phone ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>이메일</span>
          <input name="email" defaultValue={contact?.email ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>카카오 표시명</span>
          <input
            name="kakao_display_name"
            defaultValue={contact?.kakao_display_name ?? ""}
            placeholder="오픈톡/채널 닉네임"
            className={`mt-1 ${input}`}
          />
        </label>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_primary" defaultChecked={contact?.is_primary ?? false} />
          <span>주담당자</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_resigned" defaultChecked={contact?.is_resigned ?? false} />
          <span>퇴사</span>
        </label>
      </div>
      <label className={labelCls}>
        <span className={subLabel}>메모</span>
        <input name="memo" defaultValue={contact?.memo ?? ""} className={`mt-1 ${input}`} />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {pending ? "저장 중…" : contact ? "저장" : "추가"}
        </button>
        {contact && onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-slate-300 text-sm px-4 py-2 hover:bg-slate-50"
          >
            취소
          </button>
        )}
        <Msg result={result} />
      </div>
    </form>
  );
}

// ── 주소록 ───────────────────────────────────────────────────────────
function AddressesTab({
  client,
  addresses,
}: {
  client: Client;
  addresses: ClientAddress[];
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {addresses.length === 0 && (
          <div className="p-4 text-sm text-slate-400">등록된 주소가 없습니다.</div>
        )}
        {addresses.map((a) => (
          <AddressItem
            key={a.id}
            client={client}
            address={a}
            isDefaultOrigin={client.default_origin_address_id === a.id}
          />
        ))}
      </div>
      <AddressForm clientId={client.id} />
    </div>
  );
}

function AddressItem({
  client,
  address,
  isDefaultOrigin,
}: {
  client: Client;
  address: ClientAddress;
  isDefaultOrigin: boolean;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const canBeOrigin = address.usage_type === "origin" || address.usage_type === "both";

  function del() {
    if (!confirm(`주소 '${address.label}'을(를) 삭제(비활성화)할까요?`)) return;
    startTransition(async () => {
      const r = await deactivateAddressAction(address.id, client.id);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }
  function setDefault() {
    startTransition(async () => {
      const r = await setDefaultOriginAction(client.id, isDefaultOrigin ? null : address.id);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  if (edit) {
    return (
      <div className="p-3">
        <AddressForm clientId={client.id} address={address} onDone={() => setEdit(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-3.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{address.label}</span>
          {address.address_category && (
            <span className="text-[11px] rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">
              {address.address_category}
            </span>
          )}
          <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
            {USAGE_LABEL[address.usage_type]}
          </span>
          {isDefaultOrigin && (
            <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
              기본 출발지
            </span>
          )}
          {address.is_default_destination && (
            <span className="text-[11px] rounded-full bg-sky-100 text-sky-700 px-2 py-0.5">
              기본 도착지
            </span>
          )}
          {address.verify_status === "확인필요" && (
            <span className="text-[11px] rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
              확인필요
            </span>
          )}
        </div>
        {address.address && (
          <div className="text-xs text-slate-500">
            {address.address}
            {address.address_detail ? ` ${address.address_detail}` : ""}
          </div>
        )}
        {(address.contact_name || address.contact_phone) && (
          <div className="text-xs text-slate-400">
            {[address.contact_name, address.contact_phone].filter(Boolean).join(" · ")}
          </div>
        )}
        {(address.pricing_area || address.jibun_address) && (
          <div className="text-[11px] text-slate-400">
            {address.pricing_area ? `가격표 기준 ${address.pricing_area}` : ""}
            {address.jibun_address ? ` · 구주소 ${address.jibun_address}` : ""}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <Msg result={result} />
        <div className="flex items-center gap-1">
          {canBeOrigin && (
            <button
              onClick={setDefault}
              disabled={pending}
              className="text-xs text-emerald-600 hover:text-emerald-800 px-2 py-1 disabled:opacity-50"
            >
              {isDefaultOrigin ? "기본해제" : "기본출발"}
            </button>
          )}
          <button
            onClick={() => setEdit(true)}
            className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
          >
            수정
          </button>
          <button
            onClick={del}
            disabled={pending}
            className="text-xs text-rose-500 hover:text-rose-700 px-2 py-1 disabled:opacity-50"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressForm({
  clientId,
  address,
  onDone,
}: {
  clientId: string;
  address?: ClientAddress;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(fd: FormData) {
    startTransition(async () => {
      const r = address
        ? await updateAddressAction(address.id, clientId, fd)
        : await createAddressAction(clientId, fd);
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone?.();
        if (!address) (document.getElementById(`aform-${clientId}`) as HTMLFormElement)?.reset();
      }
    });
  }

  return (
    <form
      id={address ? undefined : `aform-${clientId}`}
      action={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    >
      {!address && <div className="text-sm font-semibold">주소 추가</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={labelCls}>
          <span className={subLabel}>별칭 *</span>
          <input
            name="label"
            required
            defaultValue={address?.label ?? ""}
            placeholder="본사 / 1공장 / 서울사무소"
            className={`mt-1 ${input}`}
          />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>주소명 카테고리</span>
          <select
            name="address_category"
            defaultValue={address?.address_category ?? ""}
            className={`mt-1 ${input} bg-white`}
          >
            <option value="">선택</option>
            {ADDRESS_CATEGORIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className={subLabel}>용도</span>
          <select
            name="usage_type"
            defaultValue={address?.usage_type ?? "both"}
            className={`mt-1 ${input} bg-white`}
          >
            <option value="both">출발/도착 둘 다</option>
            <option value="origin">출발지</option>
            <option value="destination">도착지</option>
          </select>
        </label>
        <label className={labelCls}>
          <span className={subLabel}>주소 확인상태</span>
          <select
            name="verify_status"
            defaultValue={address?.verify_status ?? "확인완료"}
            className={`mt-1 ${input} bg-white`}
          >
            {ADDRESS_VERIFY.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className={subLabel}>주소</span>
          <input name="address" defaultValue={address?.address ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>상세주소</span>
          <input
            name="address_detail"
            defaultValue={address?.address_detail ?? ""}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>주소 담당자</span>
          <input
            name="contact_name"
            defaultValue={address?.contact_name ?? ""}
            className={`mt-1 ${input}`}
          />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>담당자 연락처</span>
          <input
            name="contact_phone"
            defaultValue={address?.contact_phone ?? ""}
            className={`mt-1 ${input}`}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_default_destination"
          defaultChecked={address?.is_default_destination ?? false}
        />
        <span>기본 도착지로 지정</span>
      </label>

      {/* 운임(가격표) 변환 — 신주소/구주소/가격표 기준 지역 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="text-[11px] font-medium text-slate-500">
          운임 변환(가격표) — 선택 입력. 저장해두면 상담 주소 변환 시 이 거래처 주소를 우선 매칭합니다.
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="block text-xs">
            <span className={subLabel}>신주소(도로명)</span>
            <input name="road_address" defaultValue={address?.road_address ?? ""} className={`mt-1 ${input}`} />
          </label>
          <label className="block text-xs">
            <span className={subLabel}>구주소(지번)</span>
            <input name="jibun_address" defaultValue={address?.jibun_address ?? ""} className={`mt-1 ${input}`} />
          </label>
          <label className="block text-xs">
            <span className={subLabel}>가격표 기준 지역</span>
            <input
              name="pricing_area"
              defaultValue={address?.pricing_area ?? ""}
              placeholder="예: 인천 중구 항동"
              className={`mt-1 ${input}`}
            />
          </label>
        </div>
      </div>

      <label className={labelCls}>
        <span className={subLabel}>메모</span>
        <input name="memo" defaultValue={address?.memo ?? ""} className={`mt-1 ${input}`} />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {pending ? "저장 중…" : address ? "저장" : "추가"}
        </button>
        {address && onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-slate-300 text-sm px-4 py-2 hover:bg-slate-50"
          >
            취소
          </button>
        )}
        <Msg result={result} />
      </div>
    </form>
  );
}

// ── 상담이력 ─────────────────────────────────────────────────────────
//   ① 논사원 답변 기록(assistant_drafts) + 주소 변환 결과  ② 매칭된 상담자료
function pricingOf(addr: Record<string, unknown> | null, side: "origin" | "destination"): string | null {
  const s = (addr?.[side] as Record<string, unknown> | undefined) ?? null;
  return (s?.pricing_area as string) ?? null;
}

function HistoryTab({
  consultations,
  drafts,
}: {
  consultations: ClientConsultation[];
  drafts: ClientDraft[];
}) {
  return (
    <div className="space-y-4">
      {/* 논사원 답변 기록 */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">
          논사원 답변 <span className="text-slate-400 font-normal">({drafts.length})</span>
        </div>
        {drafts.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">이 거래처로 인식된 논사원 답변이 없습니다.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {drafts.map((d) => {
              const oArea = pricingOf(d.address_conversion, "origin");
              const dArea = pricingOf(d.address_conversion, "destination");
              return (
                <Link key={d.id} href={`/assistant/${d.id}`} className="block p-3.5 hover:bg-slate-50">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{d.created_at.slice(0, 10)}</span>
                    {d.client_mode && (
                      <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5">{d.client_mode}</span>
                    )}
                    {d.answer_final && (
                      <span className="rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5">수정본</span>
                    )}
                    <span className="ml-auto">{d.status}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium truncate">{d.question}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {(d.answer_final ?? d.answer_draft ?? "").replace(/\n/g, " ")}
                  </div>
                  {(oArea || dArea) && (
                    <div className="mt-0.5 text-[11px] text-sky-700">
                      가격표 기준: {oArea ?? "—"} → {dArea ?? "—"}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 매칭된 상담자료 */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold">
          매칭 상담자료 <span className="text-slate-400 font-normal">({consultations.length})</span>
        </div>
        {consultations.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">
            이 거래처로 확정된 상담자료가 없습니다. AI 매칭에서 상담을 거래처에 연결하면 표시됩니다.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {consultations.map((cv) => (
              <Link
                key={cv.conversation_id}
                href={`/chatlogs/${cv.conversation_id}`}
                className="block p-3.5 hover:bg-slate-50"
              >
                <div className="font-medium text-sm truncate">{cv.title ?? "상담"}</div>
                <div className="text-xs text-slate-400">
                  {[cv.origin, cv.destination].filter(Boolean).join(" → ")}
                  {cv.resolved_at ? ` · ${cv.resolved_at.slice(0, 10)}` : ""}
                </div>
                {(cv.origin_pricing_area || cv.destination_pricing_area) && (
                  <div className="text-[11px] text-sky-700">
                    가격표 기준: {cv.origin_pricing_area ?? "—"} → {cv.destination_pricing_area ?? "—"}
                    {cv.address_status === "needs_review" && (
                      <span className="ml-1 text-rose-600">· 주소 확인 필요</span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── 운임·요금 정책 ───────────────────────────────────────────────────
function NumField({ name, label, dv }: { name: string; label: string; dv: number | null }) {
  return (
    <label className="block text-xs">
      <span className={subLabel}>{label}</span>
      <input type="number" step="any" name={name} defaultValue={dv ?? ""} className={`mt-1 ${input}`} />
    </label>
  );
}

function PricingTab({ clientId, pricing }: { clientId: string; pricing: PricingPolicy | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const p = pricing;

  function save(fd: FormData) {
    startTransition(async () => {
      const r = await savePricingAction(clientId, fd);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <form action={save} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <div className="text-sm font-semibold mb-2">기본 운임 / 할인</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NumField name="base_fare" label="기본요금" dv={p?.base_fare ?? null} />
          <NumField name="discount_rate" label="할인율(%)" dv={p?.discount_rate ?? null} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">경유비</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <NumField name="via_same_gu" label="같은 구" dv={p?.via_same_gu ?? null} />
          <NumField name="via_other_gu" label="다른 구" dv={p?.via_other_gu ?? null} />
          <NumField name="via_other_city" label="다른 시/군" dv={p?.via_other_city ?? null} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">할증</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <NumField name="night_surcharge" label="야간할증" dv={p?.night_surcharge ?? null} />
          <NumField name="holiday_surcharge" label="휴일할증" dv={p?.holiday_surcharge ?? null} />
          <NumField name="dispatch_surcharge" label="수배할증" dv={p?.dispatch_surcharge ?? null} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="dispatch_surcharge_approval" defaultChecked={p?.dispatch_surcharge_approval ?? false} />
          <span>수배할증 사전 승인 필요(자동 반영 금지)</span>
        </label>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">작업/부대비용</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NumField name="load_fee" label="상차작업비" dv={p?.load_fee ?? null} />
          <NumField name="unload_fee" label="하차작업비" dv={p?.unload_fee ?? null} />
          <NumField name="wait_fee" label="대기료" dv={p?.wait_fee ?? null} />
          <NumField name="parking_fee" label="주차비" dv={p?.parking_fee ?? null} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="toll_included" defaultChecked={p?.toll_included ?? false} />
          <span>톨비 반영</span>
        </label>
        <label className="mt-2 block text-xs">
          <span className={subLabel}>외곽/시골/골프장/산길 특수할증(여부·내용)</span>
          <input name="special_surcharge_note" defaultValue={p?.special_surcharge_note ?? ""} className={`mt-1 ${input}`} />
        </label>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">차종별 운임</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {VEHICLE_TYPES.map((t) => (
            <NumField key={t} name={`vr_${t}`} label={t} dv={p?.vehicle_rates?.[t] ?? null} />
          ))}
        </div>
      </div>

      <label className="block text-xs">
        <span className={subLabel}>예외 규칙(자유 입력 — 여의도 별도권역, 목포 추가요금, 진이면 마산리 +5천, 휴일+야간 중복할증 금지 등)</span>
        <textarea name="exceptions" rows={4} defaultValue={p?.exceptions ?? ""} className={`mt-1 ${input}`} />
      </label>
      <label className="block text-xs">
        <span className={subLabel}>메모</span>
        <textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} className={`mt-1 ${input}`} />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
          {pending ? "저장 중…" : "운임 정책 저장"}
        </button>
        <Msg result={result} />
      </div>
    </form>
  );
}

// ── AI 업무규칙 ───────────────────────────────────────────────────────
function RulesTab({ clientId, rules }: { clientId: string; rules: ClientRule[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {rules.length === 0 && (
          <div className="p-4 text-sm text-slate-400">
            등록된 업무규칙이 없습니다. 거래처별 예외 규칙을 추가하면 논사원 AI가 답변/운임/배차 초안에 참고합니다.
          </div>
        )}
        {rules.map((r) => (
          <RuleItem key={r.id} clientId={clientId} rule={r} />
        ))}
      </div>
      <RuleForm clientId={clientId} />
    </div>
  );
}

function RuleItem({ clientId, rule }: { clientId: string; rule: ClientRule }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pending, startTransition] = useTransition();

  function del() {
    if (!confirm(`규칙 '${rule.name}'을(를) 삭제할까요?`)) return;
    startTransition(async () => {
      await deactivateRuleAction(rule.id, clientId);
      router.refresh();
    });
  }

  if (edit) {
    return (
      <div className="p-3">
        <RuleForm clientId={clientId} rule={rule} onDone={() => setEdit(false)} />
      </div>
    );
  }
  return (
    <div className="p-3.5 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5">{rule.rule_type}</span>
        <span className="font-medium">{rule.name}</span>
        {!rule.is_enabled && <span className="text-[11px] rounded-full bg-zinc-200 text-zinc-600 px-2 py-0.5">미사용</span>}
        {rule.needs_review && <span className="text-[11px] rounded-full bg-rose-100 text-rose-700 px-2 py-0.5">직원확인</span>}
        <span className="text-[11px] text-slate-400">우선순위 {rule.priority}</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setEdit(true)} className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1">수정</button>
          <button onClick={del} disabled={pending} className="text-xs text-rose-500 hover:text-rose-700 px-2 py-1 disabled:opacity-50">삭제</button>
        </div>
      </div>
      {rule.condition && <div className="mt-1 text-xs text-slate-500">조건: {rule.condition}</div>}
      {rule.content && <div className="mt-0.5 text-sm text-slate-700">{rule.content}</div>}
      {rule.example && <div className="mt-0.5 text-xs text-slate-400">예: {rule.example}</div>}
    </div>
  );
}

function RuleForm({ clientId, rule, onDone }: { clientId: string; rule?: ClientRule; onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(fd: FormData) {
    startTransition(async () => {
      const r = rule ? await updateRuleAction(rule.id, clientId, fd) : await createRuleAction(clientId, fd);
      setResult(r);
      if (r.ok) {
        router.refresh();
        onDone?.();
        if (!rule) (document.getElementById(`rform-${clientId}`) as HTMLFormElement)?.reset();
      }
    });
  }

  return (
    <form id={rule ? undefined : `rform-${clientId}`} action={submit} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {!rule && <div className="text-sm font-semibold">업무규칙 추가</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={labelCls}>
          <span className={subLabel}>규칙명 *</span>
          <input name="name" required defaultValue={rule?.name ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className={labelCls}>
          <span className={subLabel}>규칙 유형</span>
          <select name="rule_type" defaultValue={rule?.rule_type ?? "기타"} className={`mt-1 ${input} bg-white`}>
            {RULE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className={labelCls}>
        <span className={subLabel}>적용 조건</span>
        <input name="condition" defaultValue={rule?.condition ?? ""} placeholder="예: 수배할증 발생 시" className={`mt-1 ${input}`} />
      </label>
      <label className={labelCls}>
        <span className={subLabel}>적용 내용</span>
        <textarea name="content" rows={2} defaultValue={rule?.content ?? ""} placeholder="예: 고객 승인 후에만 수배할증 청구" className={`mt-1 ${input}`} />
      </label>
      <label className={labelCls}>
        <span className={subLabel}>예시</span>
        <input name="example" defaultValue={rule?.example ?? ""} className={`mt-1 ${input}`} />
      </label>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="block text-xs">
          <span className={subLabel}>우선순위</span>
          <input type="number" name="priority" defaultValue={rule?.priority ?? 0} className={`mt-1 ${input} w-24`} />
        </label>
        <label className="flex items-center gap-2 text-sm mt-4">
          <input type="checkbox" name="is_enabled" defaultChecked={rule?.is_enabled ?? true} />
          <span>사용</span>
        </label>
        <label className="flex items-center gap-2 text-sm mt-4">
          <input type="checkbox" name="needs_review" defaultChecked={rule?.needs_review ?? false} />
          <span>직원 확인 필요</span>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
          {pending ? "저장 중…" : rule ? "저장" : "추가"}
        </button>
        {rule && onDone && (
          <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 text-sm px-4 py-2 hover:bg-slate-50">취소</button>
        )}
        <Msg result={result} />
      </div>
    </form>
  );
}
