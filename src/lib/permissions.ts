// 권한 헬퍼(뼈대) — 지금은 owner/admin 구분만. 부서별·메뉴별·버튼별 세부 권한과
//   RLS 정책은 거래처/배차/정산 화면 완성 후 단계에서 추가한다(여기에 확장).
export const ADMIN_ROLES = ["owner", "admin"] as const;

// 직원관리·권한관리 등 관리자 영역 접근 가능 여부.
export function canManageStaff(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}
