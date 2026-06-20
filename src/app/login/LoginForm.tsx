"use client";

import { useActionState, useState } from "react";
import { loginAction, requestPasswordResetAction, type AuthFormState } from "./actions";

export default function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"login" | "reset">("login");

  return mode === "login" ? (
    <LoginPanel next={next} onReset={() => setMode("reset")} />
  ) : (
    <ResetPanel onBack={() => setMode("login")} />
  );
}

function LoginPanel({ next, onReset }: { next?: string; onReset: () => void }) {
  const [state, action, pending] = useActionState<AuthFormState | undefined, FormData>(
    loginAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className="text-sm font-medium">이메일</span>
        <input name="email" type="email" required autoComplete="email" className={FIELD} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">비밀번호</span>
        <input name="password" type="password" required autoComplete="current-password" className={FIELD} />
      </label>
      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={BTN}>
        {pending ? "로그인 중…" : "로그인"}
      </button>
      <button type="button" onClick={onReset} className="w-full text-center text-xs text-slate-500 hover:text-slate-700">
        비밀번호를 잊으셨나요?
      </button>
    </form>
  );
}

function ResetPanel({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState<AuthFormState | undefined, FormData>(
    requestPasswordResetAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-slate-500">가입한 이메일로 비밀번호 재설정 링크를 보냅니다.</p>
      <label className="block">
        <span className="text-sm font-medium">이메일</span>
        <input name="email" type="email" required autoComplete="email" className={FIELD} />
      </label>
      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state?.notice && <p className="text-sm text-emerald-600">{state.notice}</p>}
      <button type="submit" disabled={pending} className={BTN}>
        {pending ? "전송 중…" : "재설정 메일 보내기"}
      </button>
      <button type="button" onClick={onBack} className="w-full text-center text-xs text-slate-500 hover:text-slate-700">
        ← 로그인으로 돌아가기
      </button>
    </form>
  );
}

const FIELD = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const BTN = "w-full rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-50";
