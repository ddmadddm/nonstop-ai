"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// 비밀번호 재설정 — 메일 링크(/auth/callback)에서 복구 세션이 만들어진 상태로 진입.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ ok: false, text: "비밀번호는 8자 이상이어야 합니다." });
    if (pw !== pw2) return setMsg({ ok: false, text: "비밀번호가 일치하지 않습니다." });
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPending(false);
    if (error) {
      setMsg({ ok: false, text: "재설정에 실패했습니다. 메일 링크가 만료되었을 수 있습니다." });
      return;
    }
    setMsg({ ok: true, text: "비밀번호가 변경되었습니다. 잠시 후 이동합니다…" });
    setTimeout(() => router.replace("/dashboard"), 1200);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold">NONSTOP-AI</div>
          <div className="text-sm text-slate-500 mt-1">새 비밀번호 설정</div>
        </div>
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <label className="block">
            <span className="text-sm font-medium">새 비밀번호</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">새 비밀번호 확인</span>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" className={FIELD} />
          </label>
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
          <button type="submit" disabled={pending} className="w-full rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-50">
            {pending ? "변경 중…" : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </div>
  );
}

const FIELD = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
