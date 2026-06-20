-- ════════════════════════════════════════════════════════════════════
-- 0006_agents_staff — 직원(agents) 확장: 부서·직급·역할·이메일 + 변경이력
--
--   목적:
--     1) 직원 계정 관리(이름·직급·부서·역할·이메일)
--     2) 부서별 권한관리(role = 권한 등급, department = 소속)
--     3) 상담톡 CSV 업로드 시 직원 발화자 구분(sender_type='staff')
--     4) AI 추출이 직원명을 거래처명/담당자명으로 오인하지 않도록 제외
--
--   원칙(09 ERP 6대 원칙 유지):
--     · 물리삭제 금지(0001 trg_nodelete_agents 유지) → is_active=false 로 비활성화
--     · 모든 INSERT/UPDATE 는 fn_audit 트리거가 audit_logs 에 before/after 기록
--       (0001 의 agents 는 공통 표준 컬럼이 없어 감사 트리거가 없었음 → 여기서 추가)
-- ════════════════════════════════════════════════════════════════════

-- ── 1) 직원 속성 컬럼 ────────────────────────────────────────────────
alter table agents add column if not exists department text
  check (department in ('대표','영업/대외협력','경영지원부','배차부','접수부'));
alter table agents add column if not exists position text;   -- 직급(대표/이사/부장/과장/대리/사원 등, 자유서식)
alter table agents add column if not exists email    text;   -- 이메일(로그인/연락)
-- 역할 = 권한 등급(부서별 권한관리의 기준). 직급(position)과 분리.
alter table agents add column if not exists role text not null default 'staff'
  check (role in ('owner','admin','manager','staff','viewer'));
-- 채널톡/시스템 계정 표시(예: '논스톱서비스') — 실존 직원이 아닌 발화자 계정
alter table agents add column if not exists is_system boolean not null default false;

-- ── 2) 공통 표준 컬럼(감사/버전/비활성화) — fn_audit 부착을 위해 필요 ──
alter table agents add column if not exists row_version    int  not null default 1;
alter table agents add column if not exists created_by     uuid references agents(id);
alter table agents add column if not exists updated_at     timestamptz not null default now();
alter table agents add column if not exists updated_by     uuid references agents(id);
alter table agents add column if not exists deactivated_by uuid references agents(id);

-- ── 3) 인덱스/제약 ───────────────────────────────────────────────────
-- 이메일 유일(값이 있을 때만). 부서별 활성 직원 조회 가속.
create unique index if not exists uq_agents_email on agents(email) where email is not null;
create index if not exists idx_agents_department on agents(department) where is_active;
-- 발화자 이름 매칭(CSV 업로드 staff 판별) — 활성 직원 이름 조회.
create index if not exists idx_agents_name_active on agents(name) where is_active;

-- ── 4) 트리거: 변경이력(감사) 부착. 삭제차단은 0001 에서 이미 부착. ──
drop trigger if exists trg_audit_agents on agents;
create trigger trg_audit_agents before insert or update on agents
  for each row execute function fn_audit();
