"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientAction, type ActionResult } from "./actions";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "@/lib/clients-meta";

export default function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(fd: FormData) {
    startTransition(async () => {
      const r = await createClientAction(fd);
      setResult(r);
      if (r.ok && r.id) {
        setOpen(false);
        router.push(`/clients/${r.id}`);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2"
      >
        + 새 거래처
      </button>
    );
  }

  return (
    <form
      action={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    >
      <div className="text-sm font-semibold">새 거래처 등록</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-slate-500">거래처명 *</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">거래처 유형</span>
          <select
            name="client_type"
            defaultValue={DEFAULT_CLIENT_TYPE}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-500">사업자번호</span>
          <input
            name="business_no"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">대표 연락처</span>
          <input
            name="phone"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">기본 결제방식</span>
          <input
            name="default_payment_method"
            placeholder="월말정산 / 현금 / 카드 …"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">기본 차종</span>
          <input
            name="default_vehicle_type"
            placeholder="다마스 / 오토바이 …"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">자주 쓰는 차종(쉼표 구분)</span>
          <input
            name="frequent_vehicle_types"
            placeholder="다마스, 1톤"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-slate-500">요금조건</span>
        <input
          name="fare_terms"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-500">특이사항 메모</span>
        <textarea
          name="memo"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {pending ? "등록 중…" : "등록"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 text-sm px-4 py-2 hover:bg-slate-50"
        >
          취소
        </button>
        {result && !result.ok && (
          <span className="text-sm text-rose-600">{result.message}</span>
        )}
      </div>
    </form>
  );
}
