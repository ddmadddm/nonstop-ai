import Link from "next/link";

const INTEGRATIONS = [
  { name: "카카오 상담톡", desc: "채널톡 상담 수신·발송", connected: false },
  { name: "Supabase", desc: "DB·인증·저장소", connected: false },
  { name: "OpenAI", desc: "분류·임베딩·AI 답변", connected: false },
  { name: "통화녹취 STT", desc: "통화 음성 → 텍스트 변환·분석", connected: false },
];

export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold mb-2">거래처 관리</h2>
        <Link
          href="/settings/client-options"
          className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
        >
          <div className="font-medium">거래처 항목 설정 →</div>
          <div className="text-sm text-slate-500">
            관계/유입·거래처 구분·결제방식·담당자 역할·주소 카테고리/확인상태 항목 추가/수정/비활성화
          </div>
        </Link>
        <Link
          href="/settings/pricing"
          className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
        >
          <div className="font-medium">운임/요금 관리 → 공통 가격책정 매뉴얼 →</div>
          <div className="text-sm text-slate-500">
            차종별 기본요금·일반할증·경유할증·기타 유동할증 + 요금 초안 계산 테스트
          </div>
        </Link>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">연동 상태</h2>
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {INTEGRATIONS.map((it) => (
            <div key={it.name} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{it.name}</div>
                <div className="text-sm text-slate-500">{it.desc}</div>
              </div>
              <span
                className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                  it.connected
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {it.connected ? "연결됨" : "미연결"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          현재 목업 모드입니다. API 키를 받으면 `.env`에 등록 후 실제 연동으로
          전환합니다.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">사용자/팀</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 space-y-1">
          <div>· 접수팀 — 오더 접수·확인</div>
          <div>· 배차팀 — 기사 매칭·배차정보·운행 관리</div>
          <div>· 관리자 — 전체 통계·거래처·설정</div>
          <div className="text-xs text-slate-400 pt-1">
            (로그인·권한은 Supabase Auth 연동 시 활성화)
          </div>
        </div>
      </section>
    </div>
  );
}
