-- ════════════════════════════════════════════════════════════════════
-- 0031_pricing — 운임/요금 정책: 공통 가격책정 매뉴얼 + 거래처별 단가표 + 계산 이력
--   원칙: 신규=공통 매뉴얼 / 기존=거래처 단가표 우선 → 매뉴얼 fallback.
--         AI는 '요금 초안'만 제안, 최종 확정은 직원. 물리삭제 금지(is_active=false),
--         모든 변경 fn_audit 기록.
-- ════════════════════════════════════════════════════════════════════

-- 공통 표준(감사/비활성화) 컬럼 묶음을 각 테이블에 동일 부여.
-- ── 1) 공통 가격책정 매뉴얼(버전 관리) ───────────────────────────────
create table if not exists pricing_manuals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  description text,
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references agents(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);

-- ── 2) 차종별 기본요금 ───────────────────────────────────────────────
create table if not exists pricing_base_rates (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references pricing_manuals(id) on delete restrict,
  vehicle_type text not null,
  base_price numeric not null default 0,
  base_condition text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create index if not exists idx_base_manual on pricing_base_rates(manual_id) where is_active;

-- ── 3) 일반할증(시간대/방식) ─────────────────────────────────────────
create table if not exists pricing_surcharges (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references pricing_manuals(id) on delete restrict,
  surcharge_type text,                 -- wait | round_trip | holiday | early | night | late_night | dawn | same_day
  name text not null,
  quick_amount numeric,
  truck_amount numeric,
  calculation_type text not null default 'fixed' check (calculation_type in ('fixed','percent','range')),
  percent_min numeric, percent_max numeric,
  time_start text, time_end text,      -- 'HH:MM'
  description text,
  requires_review boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create index if not exists idx_surcharge_manual on pricing_surcharges(manual_id) where is_active;

-- ── 4) 경유할증(거리 구분 × 차종) ────────────────────────────────────
create table if not exists pricing_stopover_surcharges (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references pricing_manuals(id) on delete restrict,
  stopover_type text not null,         -- same_area | near_city | far
  vehicle_type text not null,
  amount numeric not null default 0,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create index if not exists idx_stopover_manual on pricing_stopover_surcharges(manual_id) where is_active;

-- ── 5) 기타 유동할증 ─────────────────────────────────────────────────
create table if not exists pricing_variable_surcharges (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references pricing_manuals(id) on delete restrict,
  name text not null,
  default_handling text not null default '직원확인' check (default_handling in ('별도협의','직원확인','자동계산')),
  default_amount numeric,
  requires_review boolean not null default true,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create index if not exists idx_variable_manual on pricing_variable_surcharges(manual_id) where is_active;

-- ── 6) 거래처별 단가표(원본/버전) ────────────────────────────────────
create table if not exists client_rate_sheets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  title text not null,
  file_id uuid,                        -- client_documents.id 등 보관 파일 참조(선택)
  file_name text,
  stored_path text,                    -- 원본 보관 경로
  origin_base_area text,               -- 출발 기준지
  version int not null default 1,
  effective_from date, effective_to date,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  memo text,
  is_active boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create index if not exists idx_ratesheet_client on client_rate_sheets(client_id) where is_active;

-- ── 7) 거래처별 표준화 단가 항목 ─────────────────────────────────────
create table if not exists client_rate_items (
  id uuid primary key default gen_random_uuid(),
  rate_sheet_id uuid not null references client_rate_sheets(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  origin_area text,
  destination_area text,
  vehicle_type text,
  normal_price numeric,
  discounted_price numeric,
  competitive_price numeric,
  billing_price numeric,
  driver_price_reference numeric,
  stopover_rule text,
  surcharge_rule text,
  memo text,
  requires_review boolean not null default false,
  confidence numeric,
  sort_order int not null default 0,
  is_active boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create index if not exists idx_rateitem_sheet on client_rate_items(rate_sheet_id) where is_active;
create index if not exists idx_rateitem_client on client_rate_items(client_id) where is_active;

-- ── 8) 요금 계산 이력(append-only) ──────────────────────────────────
create table if not exists pricing_calculation_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  source_type text,                    -- assistant | consultation | manual_test
  source_id text,
  origin_raw text, destination_raw text,
  origin_pricing_area text, destination_pricing_area text,
  vehicle_type text,
  selected_rule_type text,             -- client_rate | client_rule | common_manual | ai_estimate
  base_price numeric, surcharge_total numeric, discount_amount numeric,
  final_suggested_price numeric,
  confidence numeric,
  requires_review boolean not null default false,
  calculation_detail jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references agents(id)
);
create index if not exists idx_calclog_client on pricing_calculation_logs(client_id, created_at desc);

-- ── 트리거: 감사 + 삭제차단(계산이력은 append-only → 삭제차단만) ─────
do $$ declare t text; begin
  foreach t in array array['pricing_manuals','pricing_base_rates','pricing_surcharges',
    'pricing_stopover_surcharges','pricing_variable_surcharges','client_rate_sheets','client_rate_items'] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s before insert or update on %1$s for each row execute function fn_audit()', t);
    execute format('drop trigger if exists trg_nodelete_%1$s on %1$s', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s for each row execute function fn_block_delete()', t);
  end loop;
  execute 'drop trigger if exists trg_nodelete_pricing_calculation_logs on pricing_calculation_logs';
  execute 'create trigger trg_nodelete_pricing_calculation_logs before delete on pricing_calculation_logs for each row execute function fn_block_delete()';
end $$;

-- ════════════════════════════════════════════════════════════════════
-- seed — 공통 가격책정 매뉴얼 v1 + 기본 데이터
-- ════════════════════════════════════════════════════════════════════
insert into pricing_manuals (name, version, description, effective_from)
select '공통 가격책정 매뉴얼', 1, '신규 고객·단가표 없는 거래처 기준', current_date
where not exists (select 1 from pricing_manuals where name='공통 가격책정 매뉴얼' and version=1);

-- 기본요금
insert into pricing_base_rates (manual_id, vehicle_type, base_price, base_condition, sort_order)
select m.id, v.vt, v.bp, v.bc, v.ord
from pricing_manuals m,
 (values ('오토바이',10000,'퀵 기본',1),('다마스',20000,'소형화물 기본',2),('라보',30000,'',3),
         ('트럭 1톤',40000,'',4),('1.4톤/리프트',60000,'',5),('2.5톤/냉탑',80000,'',6)) as v(vt,bp,bc,ord)
where m.name='공통 가격책정 매뉴얼' and m.version=1
  and not exists (select 1 from pricing_base_rates b where b.manual_id=m.id);

-- 일반할증
insert into pricing_surcharges (manual_id, surcharge_type, name, quick_amount, truck_amount, calculation_type, percent_min, percent_max, time_start, time_end, sort_order)
select m.id, s.st, s.nm, s.qa, s.ta, s.ct, s.pmin, s.pmax, s.ts, s.te, s.ord
from pricing_manuals m,
 (values
   ('wait','대기료(시간당)',10000,10000,'fixed',null,null,null,null,1),
   ('round_trip','왕복',null,null,'percent',50,75,null,null,2),
   ('holiday','휴일',5000,10000,'fixed',null,null,null,null,3),
   ('early','조조(06~08시)',5000,10000,'fixed',null,null,'06:00','08:00',4),
   ('night','야간(18~21시)',5000,10000,'fixed',null,null,'18:00','21:00',5),
   ('late_night','심야(21~00시)',10000,15000,'fixed',null,null,'21:00','00:00',6),
   ('dawn','새벽(00~06시)',15000,20000,'fixed',null,null,'00:00','06:00',7),
   ('same_day','야상(당일상차/익일배송)',10000,10000,'fixed',null,null,null,null,8)
 ) as s(st,nm,qa,ta,ct,pmin,pmax,ts,te,ord)
where m.name='공통 가격책정 매뉴얼' and m.version=1
  and not exists (select 1 from pricing_surcharges p where p.manual_id=m.id);

-- 경유할증
insert into pricing_stopover_surcharges (manual_id, stopover_type, vehicle_type, amount, sort_order)
select m.id, s.t, s.vt, s.amt, s.ord
from pricing_manuals m,
 (values
   ('same_area','오토바이',10000,1),('same_area','다마스',10000,2),('same_area','라보',15000,3),('same_area','트럭 1톤',20000,4),('same_area','냉탑',30000,5),
   ('near_city','오토바이',20000,6),('near_city','다마스',20000,7),('near_city','라보',25000,8),('near_city','트럭 1톤',30000,9),('near_city','냉탑',40000,10),
   ('far','오토바이',30000,11),('far','다마스',30000,12),('far','라보',35000,13),('far','트럭 1톤',40000,14),('far','냉탑',50000,15)
 ) as s(t,vt,amt,ord)
where m.name='공통 가격책정 매뉴얼' and m.version=1
  and not exists (select 1 from pricing_stopover_surcharges p where p.manual_id=m.id);

-- 기타 유동할증
insert into pricing_variable_surcharges (manual_id, name, default_handling, requires_review, sort_order)
select m.id, s.nm, s.h, true, s.ord
from pricing_manuals m,
 (values ('기사 단독 수작업','별도협의',1),('폭설/폭우 등 기상악화','별도협의',2),('수배 지연 할증','직원확인',3)) as s(nm,h,ord)
where m.name='공통 가격책정 매뉴얼' and m.version=1
  and not exists (select 1 from pricing_variable_surcharges p where p.manual_id=m.id);
