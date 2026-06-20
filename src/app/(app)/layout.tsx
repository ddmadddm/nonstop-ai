import AppShell from "@/components/AppShell";
import { requireAgent } from "@/lib/auth";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 미인증/미등록/시스템/비활성 사용자는 여기서 /login 으로 redirect.
  // (proxy 에서 1차 차단, 여기서 직원 자격 2차 확인 + 사용자 정보 주입)
  const { agent } = await requireAgent();
  return (
    <AppShell
      user={{ name: agent.name, role: agent.role, department: agent.department }}
    >
      {children}
    </AppShell>
  );
}
