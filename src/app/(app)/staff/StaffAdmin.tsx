"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cx, formatDateTime } from "@/lib/utils";
import { DEPARTMENTS, ROLES, ROLE_LABEL, ROLE_BADGE } from "@/lib/staff";
import type { Agent, AgentHistory } from "@/lib/db/agents";
import {
  createAgentAction,
  updateAgentAction,
  deactivateAgentAction,
  changeRoleAction,
  createAuthAccountAction,
  checkEmailAction,
  getAgentHistoryAction,
  type ActionResult,
} from "./actions";

type StatusFilter = "all" | "active" | "inactive";

export default function StaffAdmin({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const [historyFor, setHistoryFor] = useState<Agent | null>(null);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const staff = useMemo(() => agents.filter((a) => !a.is_system), [agents]);
  const system = useMemo(() => agents.filter((a) => a.is_system), [agents]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return staff.filter((a) => {
      if (needle && !a.name.toLowerCase().includes(needle)) return false;
      if (dept && a.department !== dept) return false;
      if (role && a.role !== role) return false;
      if (status === "active" && !a.is_active) return false;
      if (status === "inactive" && a.is_active) return false;
      return true;
    });
  }, [staff, q, dept, role, status]);

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const r = await fn();
      setToast(r);
      if (r.ok) router.refresh();
    });
  }

  function quickRole(a: Agent, next: string) {
    if (next === a.role) return;
    run(() => changeRoleAction(a.id, next));
  }

  function deactivate(a: Agent) {
    if (!confirm(`${a.name} 직원을 비활성화할까요? (삭제가 아니라 비활성 처리됩니다)`)) return;
    run(() => deactivateAgentAction(a.id));
  }

  function createAccount(a: Agent) {
    if (!a.email) {
      setToast({ ok: false, message: "이메일이 없는 직원은 로그인 계정을 만들 수 없습니다." });
      return;
    }
    if (!confirm(`${a.name}(${a.email})의 로그인 계정을 생성할까요? 임시 비밀번호가 1회 표시됩니다.`)) return;
    run(() => createAuthAccountAction(a.id));
  }

  return (
    <div className="space-y-5">
      {/* 필터 바 */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 검색"
          className="flex-1 min-w-[8rem] rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">전체 부서</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">전체 권한</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
          <option value="all">전체</option>
        </select>
        <button
          onClick={() => setEditing("new")}
          className="ml-auto rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2"
        >
          + 직원 추가
        </button>
      </div>

      {toast && (
        <div className={cx("text-sm rounded-lg px-3 py-2", toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          {toast.message}
        </div>
      )}

      {/* 직원 목록 */}
      <section>
        <h2 className="text-sm font-semibold mb-2">
          직원 <span className="text-slate-400">({filtered.length}명)</span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">직급</th>
                <th className="px-3 py-2 font-medium">부서</th>
                <th className="px-3 py-2 font-medium">권한</th>
                <th className="px-3 py-2 font-medium">이메일</th>
                <th className="px-3 py-2 font-medium">연락처</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    조건에 맞는 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className={cx(!a.is_active && "opacity-50")}>
                    <td className="px-3 py-2 font-medium">
                      {a.name}
                      {a.auth_uid && <span title="로그인 계정 연동됨" className="ml-1 text-emerald-600">🔑</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{a.position ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{a.department ?? "-"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={a.role}
                        disabled={pending || !a.is_active}
                        onChange={(e) => quickRole(a, e.target.value)}
                        className={cx("rounded-full px-2 py-0.5 text-xs font-medium border-0", ROLE_BADGE[a.role] ?? "bg-slate-100 text-slate-600")}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-[14rem] truncate" title={a.email ?? ""}>{a.email ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{a.phone ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className={cx("rounded-full px-2 py-0.5 text-xs", a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500")}>
                        {a.is_active ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5 text-xs">
                        <button onClick={() => setEditing(a)} className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50">수정</button>
                        <button onClick={() => setHistoryFor(a)} className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50">이력</button>
                        {a.is_active && !a.auth_uid && (
                          <button onClick={() => createAccount(a)} disabled={pending} className="rounded-md border border-sky-200 text-sky-700 px-2 py-1 hover:bg-sky-50">계정생성</button>
                        )}
                        {a.is_active && (
                          <button onClick={() => deactivate(a)} disabled={pending} className="rounded-md border border-rose-200 text-rose-600 px-2 py-1 hover:bg-rose-50">비활성화</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 시스템 계정(구분 표시) */}
      <section>
        <h2 className="text-sm font-semibold mb-2 text-slate-500">
          시스템 계정 <span className="text-slate-400">({system.length}) · 상담톡 발화자 분류 · AI 추출 제외 · 로그인 불가</span>
        </h2>
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 divide-y divide-slate-200">
          {system.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-base">🤖</span>
              <span className="font-medium">{a.name}</span>
              <span className={cx("rounded-full px-2 py-0.5 text-xs", ROLE_BADGE.system)}>시스템</span>
              <span className={cx("ml-auto rounded-full px-2 py-0.5 text-xs", a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500")}>
                {a.is_active ? "활성" : "비활성"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <StaffForm
          agent={editing === "new" ? null : editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSubmit={(fd) =>
            run(async () => {
              const r =
                editing === "new"
                  ? await createAgentAction(fd)
                  : await updateAgentAction(editing.id, fd);
              if (r.ok) setEditing(null);
              return r;
            })
          }
        />
      )}

      {historyFor && <HistoryModal agent={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

// ── 추가/수정 폼(모달) ────────────────────────────────────────────────
const FIELD = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

function StaffForm({
  agent,
  pending,
  onClose,
  onSubmit,
}: {
  agent: Agent | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [email, setEmail] = useState(agent?.email ?? "");
  const [emailDup, setEmailDup] = useState(false);
  const [active, setActive] = useState(agent?.is_active ?? true);
  const isEdit = !!agent;

  async function checkDup() {
    const e = email.trim();
    if (!e) return setEmailDup(false);
    setEmailDup(await checkEmailAction(e, agent?.id));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (emailDup) return;
    const fd = new FormData(e.currentTarget);
    fd.set("is_active", active ? "true" : "false");
    onSubmit(fd);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-lg rounded-xl bg-white p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold">{isEdit ? `직원 수정 — ${agent!.name}` : "직원 추가"}</h3>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">이름 *</span>
            <input name="name" required defaultValue={agent?.name ?? ""} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">직급</span>
            <input name="position" defaultValue={agent?.position ?? ""} placeholder="대표/이사/부장/과장/대리…" className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">부서</span>
            <select name="department" defaultValue={agent?.department ?? ""} className={FIELD}>
              <option value="">선택 안 함</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">역할/권한</span>
            <select name="role" defaultValue={agent?.role ?? "staff"} className={FIELD}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]} ({r})</option>
              ))}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="text-sm font-medium">이메일</span>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailDup(false); }}
              onBlur={checkDup}
              placeholder="example@gmail.com"
              className={cx(FIELD, emailDup && "border-rose-400")}
            />
            {emailDup && <span className="text-xs text-rose-600">이미 등록된 이메일입니다.</span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium">연락처</span>
            <input name="phone" defaultValue={agent?.phone ?? ""} placeholder="010-0000-0000" className={FIELD} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-medium">활성 상태</span>
          </label>
          <label className="block col-span-2">
            <span className="text-sm font-medium">메모</span>
            <textarea name="memo" defaultValue={agent?.memo ?? ""} rows={2} className={FIELD} />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">취소</button>
          <button type="submit" disabled={pending || emailDup} className="rounded-lg bg-slate-900 text-white px-5 py-2 text-sm font-medium disabled:opacity-50">
            {pending ? "저장 중…" : isEdit ? "저장" : "추가"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── 변경 이력(모달) ───────────────────────────────────────────────────
const TRACK: { k: string; label: string }[] = [
  { k: "name", label: "이름" },
  { k: "position", label: "직급" },
  { k: "department", label: "부서" },
  { k: "role", label: "권한" },
  { k: "email", label: "이메일" },
  { k: "phone", label: "연락처" },
  { k: "memo", label: "메모" },
  { k: "is_active", label: "활성" },
];
const ACTION_LABEL: Record<string, string> = { INSERT: "등록", UPDATE: "수정", DEACTIVATE: "비활성화" };

function diff(h: AgentHistory): string[] {
  if (h.action !== "UPDATE" || !h.before || !h.after) return [];
  const out: string[] = [];
  for (const { k, label } of TRACK) {
    const b = h.before[k] ?? null;
    const a = h.after[k] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) out.push(`${label}: ${b ?? "-"} → ${a ?? "-"}`);
  }
  return out;
}

function HistoryModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [rows, setRows] = useState<AgentHistory[] | null>(null);

  useEffect(() => {
    let alive = true;
    getAgentHistoryAction(agent.id).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [agent.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold mb-3">변경 이력 — {agent.name}</h3>
        {rows === null ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">이력이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((h, i) => {
              const changes = diff(h);
              return (
                <li key={i} className="rounded-lg border border-slate-100 p-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                    <span className="text-slate-500 text-xs">{h.changed_by_name ?? "시스템"} · {formatDateTime(h.changed_at)}</span>
                  </div>
                  {changes.length > 0 && (
                    <ul className="mt-1.5 text-xs text-slate-600 space-y-0.5">
                      {changes.map((c, j) => <li key={j}>· {c}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end pt-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">닫기</button>
        </div>
      </div>
    </div>
  );
}
