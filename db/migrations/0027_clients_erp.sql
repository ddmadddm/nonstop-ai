-- ════════════════════════════════════════════════════════════════════
-- 0027_clients_erp — 거래처 관리(ERP) 1단계: 기본정보/담당자/주소록 필드 확장
--   인성 프로그램을 대체하지 않는 보조 시스템. 거래처 마스터 정보를 보강한다.
--   모두 additive. 변경이력은 기존 fn_audit 트리거가 자동 기록.
-- ════════════════════════════════════════════════════════════════════

-- ── 거래처(기본정보 보강) ────────────────────────────────────────────
alter table clients
  add column if not exists ceo_name             text,    -- 대표자명
  add column if not exists email                text,
  add column if not exists address              text,    -- 거래처 주소(대표)
  add column if not exists started_on           date,    -- 거래시작일
  add column if not exists tax_invoice           boolean not null default false, -- 세금계산서 발행
  add column if not exists default_discount_rate numeric,                         -- 기본 할인율(%)
  add column if not exists manager_agent_id     uuid references agents(id);       -- 담당 직원

-- 거래처 구분에 '휴면' 추가(주거래처/일반거래처/1회성/잠재고객/휴면).
--   '비활성'은 is_active=false, '신규후보'는 client_prospects 로 별도 관리.
alter table clients drop constraint if exists clients_client_type_check;
alter table clients add constraint clients_client_type_check
  check (client_type in ('주거래처','일반거래처','1회성','잠재고객','휴면'));

-- ── 담당자(역할/부서/퇴사) ───────────────────────────────────────────
alter table client_contacts
  add column if not exists department  text,   -- 부서
  add column if not exists role        text,   -- 배차담당/결제담당/현장담당/야간담당/대표담당/기타
  add column if not exists is_resigned boolean not null default false; -- 퇴사 여부
create index if not exists idx_contacts_active_role
  on client_contacts(client_id) where is_active and not is_resigned;

-- ── 주소록(주소명 카테고리/기본도착지/확인상태) ─────────────────────
alter table client_addresses
  add column if not exists address_category     text,    -- 본사/공장/창고/1공장/2공장/현장/기타
  add column if not exists is_default_destination boolean not null default false, -- 기본 도착지
  add column if not exists verify_status         text not null default '확인완료'  -- 확인완료/확인필요
    check (verify_status in ('확인완료','확인필요'));
