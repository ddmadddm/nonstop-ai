// 서버 컴포넌트/액션용 Supabase 클라이언트 — 쿠키로 세션을 읽고 갱신한다.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // 서버 컴포넌트에서 호출되면 쓰기가 막혀 throw 날 수 있다 → 무시(세션 갱신은 proxy 가 담당).
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* Server Component context — proxy.ts 가 쿠키를 갱신함 */
        }
      },
    },
  });
}
