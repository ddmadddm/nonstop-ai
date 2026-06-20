import { listAgents } from "@/lib/db/agents";
import { requireRoles } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import StaffAdmin from "./StaffAdmin";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  // 직원관리는 owner/admin 전용(아니면 /dashboard 로 redirect).
  await requireRoles(ADMIN_ROLES);
  const agents = await listAgents();
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl">
      <div>
        <p className="text-sm text-slate-500">
          논스톱서비스 직원 계정을 관리합니다 — 추가 · 수정 · 비활성화 · 권한 변경.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          ※ 직원은 <b>물리 삭제하지 않고 비활성화</b>합니다. 모든 변경은 이력
          (audit_logs)에 자동 기록됩니다. <b>시스템 계정</b>은 상담톡 발화자
          분류·AI 추출 제외용이며 로그인 대상이 아닙니다.
        </p>
      </div>
      <StaffAdmin agents={agents} />
    </div>
  );
}
