// Next 16 Proxy(구 middleware) — 인증 게이트.
//   미로그인 사용자는 /login 으로 보낸다. 공개 경로(login·auth 콜백·정적)는 통과.
//   ※ 여기서는 "낙관적 체크"만 한다(세션 존재 여부). 세부 권한/역할 검사는
//     각 페이지/서버액션의 DAL(requireAgent/requireRoles)에서 수행.
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const PUBLIC_PREFIXES = ["/login", "/auth"];

function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  // 로그인 보류 상태(Supabase 키 미설정)에서는 인증 게이트를 끄고 통과시킨다.
  // 키가 채워지면 자동으로 인증이 강제된다(로그인 뼈대는 그대로 대기).
  if (!isSupabaseConfigured()) return NextResponse.next();

  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // 이미 로그인했는데 /login 이면 대시보드로.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // api·정적 자산·이미지·매니페스트는 제외. 그 외 모든 경로에서 인증 체크.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
