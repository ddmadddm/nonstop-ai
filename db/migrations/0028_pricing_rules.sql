-- ════════════════════════════════════════════════════════════════════
-- 0028_pricing_rules — 거래처 운임/요금 정책 + AI 업무규칙(2단계)
--   운임은 단순 거리 기준이 아니라 거래처·지역·차종·상황별 예외가 많다.
--   구조화 항목 + 차종별 운임(jsonb) + 예외 규칙(자유 텍스트)을 함께 보관.
--   AI 업무규칙은 거래처별 예외 규칙을 저장해 논사원 AI가 답변/운임/배차에 참고.
--   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit.
-- ════════════════════════════════════════════════════════════════════

-- ── 거래처 운임/요금 정책(거래처당 활성 1건) ─────────────────────────
create table if not exists client_pricing_policies (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete restrict,

  base_fare       numeric,   -- 기본요금
  discount_rate   numeric,   -- 할인율(%)
  -- 경유비
  via_same_gu     numeric,   -- 같은 구 경유비
  via_other_gu    numeric,   -- 다른 구 경유비
  via_other_city  numeric,   -- 다른 시/군 경유비
  -- 할증
  night_surcharge   numeric, -- 야간할증
  holiday_surcharge numeric, -- 휴일할증
  dispatch_surcharge numeric, -- 수배할증
  dispatch_surcharge_approval boolean not null default false, -- 수배할증 사전 승인 필요
  -- 작업/부대비용
  load_fee     numeric,  -- 상차작업비
  unload_fee   numeric,  -- 하차작업비
  wait_fee     numeric,  -- 대기료
  parking_fee  numeric,  -- 주차비
  toll_included boolean not null default false, -- 톨비 반영 여부
  special_surcharge_note text, -- 외곽/시골/골프장/산길 특수할증(여부+내용)

  vehicle_rates jsonb not null default '{}'::jsonb, -- 차종별 운임 {차종: 금액}
  exceptions   text,   -- 예외 규칙(여의도 별도권역/목포 추가요금/마산리 +5천 등)
  notes        text,

  is_active      boolean not null default true,
  row_version    int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references agents(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents(id),
  deactivated_at timestamptz,
  deactivated_by uuid references agents(id)
);
create unique index if not exists uq_pricing_client on client_pricing_policies(client_id) where is_active;

-- ── AI 업무규칙(거래처당 다수) ───────────────────────────────────────
create table if not exists client_rules (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete restrict,
  name        text not null,                       -- 규칙명
  rule_type   text not null default '기타'
              check (rule_type in ('운임','경유','할인','수배할증','정산','고객응대','배차','기타')),
  condition   text,    -- 적용 조건
  content     text,    -- 적용 내용
  example     text,    -- 예시
  priority    int not null default 0,              -- 우선순위(높을수록 우선)
  is_enabled  boolean not null default true,       -- 사용 여부
  needs_review boolean not null default false,     -- 직원 확인 필요

  is_active      boolean not null default true,
  row_version    int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references agents(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents(id),
  deactivated_at timestamptz,
  deactivated_by uuid references agents(id)
);
create index if not exists idx_rules_client on client_rules(client_id) where is_active;

-- 트리거: 감사 + 삭제차단
do $$
declare t text;
begin
  foreach t in array array['client_pricing_policies','client_rules']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s before insert or update on %1$s for each row execute function fn_audit()', t);
    execute format('drop trigger if exists trg_nodelete_%1$s on %1$s', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s for each row execute function fn_block_delete()', t);
  end loop;
end $$;
