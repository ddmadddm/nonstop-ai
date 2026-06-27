"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Prospect } from "@/lib/db/prospects";
import {
  promoteProspectAction,
  linkProspectAction,
  rejectProspectAction,
  type ProspectActionResult,
} from "../actions";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2 text-sm py-1">
      <span className="text-slate-400 w-16 shrink-0">{label}</span>
      <span className="min-w-0">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

export default function ProspectDetail({
  prospect,
  clientOptions,
}: {
  prospect: Prospect;
  clientOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ProspectActionResult | null>(null);
  const [sel, setSel] = useState("");

  const converted = prospect.status === "converted";
  const rejected = prospect.status === "rejected";

  function promote(fd: FormData) {
    startTransition(async () => {
      const r = await promoteProspectAction(prospect.id, fd);
      setResult(r);
      if (r.ok && r.clientId) router.push(`/clients/${r.clientId}`);
    });
  }
  function link() {
    startTransition(async () => {
      const r = await linkProspectAction(prospect.id, sel);
      setResult(r);
      if (r.ok && r.clientId) router.push(`/clients/${r.clientId}`);
    });
  }
  function reject() {
    startTransition(async () => {
      const r = await rejectProspectAction(prospect.id);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* 추출 정보 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold mb-1">추출된 정보</div>
        <Field label="거래처명" value={prospect.name} />
        <Field label="담당자" value={prospect.manager_name} />
        <Field label="연락처" value={prospect.phone} />
        <Field label="출발지" value={prospect.origin} />
        <Field label="도착지" value={prospect.destination} />
        {prospect.question && (
          <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500 whitespace-pre-wrap">
            {prospect.question}
          </div>
        )}
      </div>

      {converted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <span className="text-emerald-700 font-medium">처리 완료</span>
          {prospect.client_id && (
            <Link
              href={`/clients/${prospect.client_id}`}
              className="ml-2 text-sky-600 hover:underline"
            >
              {prospect.client_name ?? "연결된 거래처"} 보기 →
            </Link>
          )}
        </div>
      ) : rejected ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          무시된 후보입니다.
        </div>
      ) : (
        <>
          {/* 기존 거래처에 연결 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="text-sm font-semibold">기존 거래처에 연결</div>
            <p className="text-xs text-slate-400">
              선택한 거래처에 이 후보의 담당자/주소만 추가합니다(거래처 본체는 변경하지 않음).
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={sel}
                onChange={(e) => setSel(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                <option value="">거래처 선택…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={link}
                disabled={pending || !sel}
                className="rounded-lg border border-slate-300 text-sm px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
              >
                연결
              </button>
            </div>
          </div>

          {/* 신규 거래처로 등록 */}
          <form
            action={promote}
            className="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
          >
            <div className="text-sm font-semibold">신규 거래처로 등록</div>
            <p className="text-xs text-slate-400">
              거래처 + 담당자 + 출발/도착 주소를 함께 생성합니다.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="text-slate-500 text-xs">거래처명 *</span>
                <input
                  name="name"
                  required
                  defaultValue={prospect.name ?? ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-500 text-xs">대표 연락처</span>
                <input
                  name="phone"
                  defaultValue={prospect.phone ?? ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              신규 거래처로 등록
            </button>
          </form>

          {/* 무시 */}
          <div className="flex items-center gap-2">
            <button
              onClick={reject}
              disabled={pending}
              className="rounded-lg border border-slate-200 text-slate-500 text-sm px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              무시
            </button>
            {result && (
              <span className={`text-sm ${result.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {result.message}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
