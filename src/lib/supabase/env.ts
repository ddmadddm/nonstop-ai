// Supabase 환경값 — 서버/클라이언트 공용(NEXT_PUBLIC_ 변수는 빌드시 인라인됨).
//   키가 아직 채워지지 않은 상태(.env 플레이스홀더)에서도 앱이 죽지 않도록
//   isConfigured() 로 분기한다. 미설정이면 미인증으로 간주 → /login 유도.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_URL.includes("[") &&
    SUPABASE_ANON_KEY.length > 20
  );
}
