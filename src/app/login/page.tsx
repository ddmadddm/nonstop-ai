import LoginForm from "./LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  "not-staff": "등록된 직원 계정이 아닙니다. 관리자에게 문의하세요.",
  system: "시스템 계정은 로그인할 수 없습니다.",
  inactive: "비활성화된 계정입니다. 관리자에게 문의하세요.",
  forbidden: "접근 권한이 없습니다.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const configured = isSupabaseConfigured();
  const errorMsg = sp.error ? ERROR_MESSAGES[sp.error] : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold">NONSTOP-AI</div>
          <div className="text-sm text-slate-500 mt-1">논사원 AI · 직원 로그인</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {!configured && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              로그인이 아직 설정되지 않았습니다. 관리자는 <code>.env</code> 의
              <code> NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 채운 뒤 재시작하세요.
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}
          <LoginForm next={sp.next} />
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          논스톱서비스 임직원 전용 · 계정 문의는 관리자에게
        </p>
      </div>
    </div>
  );
}
