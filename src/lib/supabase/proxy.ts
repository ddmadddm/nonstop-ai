// proxy(미들웨어)용 세션 갱신 헬퍼 — 매 요청마다 Supabase 세션 쿠키를 새로고침하고
//   현재 사용자를 함께 돌려준다. (Next 16: middleware → proxy 로 명칭 변경)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./env";
import type { User } from "@supabase/supabase-js";

export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  const response = NextResponse.next({ request });

  // 키 미설정이면 인증을 시도하지 않고 미인증으로 처리(/login 유도).
  if (!isSupabaseConfigured()) return { response, user: null };

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null; // 네트워크/설정 문제 시 미인증 처리
  }
  return { response, user };
}
