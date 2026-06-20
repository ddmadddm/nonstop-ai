// 서비스 롤(관리자) Supabase 클라이언트 — 직원 로그인 계정 생성/관리 전용.
//   service_role 키는 절대 클라이언트로 노출 금지. 서버에서만 import.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isAdminConfigured(): boolean {
  return SUPABASE_URL.startsWith("http") && !SUPABASE_URL.includes("[") && SERVICE_KEY.length > 20;
}

export function createSupabaseAdminClient() {
  if (!isAdminConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. .env 에 서비스 롤 키를 채워주세요.",
    );
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
