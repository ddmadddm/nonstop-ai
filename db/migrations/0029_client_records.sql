-- ════════════════════════════════════════════════════════════════════
-- 0029_client_records — 배차이력 / 정산이력 / 문서관리(4단계)
--   인성 프로그램·엑셀 업로드·정산 자동화와 향후 연결할 수 있게 구조를 먼저 만든다.
--   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit.
-- ════════════════════════════════════════════════════════════════════

-- ── 배차이력(향후 인성/엑셀 연동) ────────────────────────────────────
create table if not exists client_dispatch_histories (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete restrict,
  received_on  date,                 -- 접수일
  origin       text,
  destination  text,
  vehicle_type text,
  driver_name  text,                 -- 기사
  charge_amount numeric,             -- 청구금액
  driver_fee   numeric,              -- 기사비
  margin       numeric generated always as (coalesce(charge_amount,0) - coalesce(driver_fee,0)) stored, -- 마진
  dispatch_surcharge numeric,        -- 수배할증
  via_fee      numeric,              -- 경유비
  status       text,
  source       text not null default 'manual', -- manual | insung | excel (연동 출처)
  external_id  text,                 -- 외부 시스템 키(인성 등 멱등 연동)
  memo         text,

  is_active      boolean not null default true,
  row_version    int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references agents(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents(id),
  deactivated_at timestamptz,
  deactivated_by uuid references agents(id)
);
create index if not exists idx_dispatch_client on client_dispatch_histories(client_id) where is_active;
create unique index if not exists uq_dispatch_external
  on client_dispatch_histories(source, external_id) where external_id is not null;

-- ── 정산이력(향후 마감/정산 자동화) ──────────────────────────────────
create table if not exists client_settlements (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete restrict,
  close_month  text,                 -- 마감월(YYYY-MM)
  total_charge numeric,              -- 총 청구금액
  total_driver_fee numeric,          -- 총 기사비
  commission   numeric,              -- 수수료
  discount_amount numeric,           -- 할인금액
  tax_invoice_issued boolean not null default false, -- 세금계산서 발행
  paid         boolean not null default false,       -- 입금 여부
  unpaid_amount numeric,             -- 미수금
  memo         text,

  is_active      boolean not null default true,
  row_version    int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references agents(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents(id),
  deactivated_at timestamptz,
  deactivated_by uuid references agents(id)
);
create index if not exists idx_settlement_client on client_settlements(client_id) where is_active;

-- ── 문서관리(거래처별 파일) ──────────────────────────────────────────
create table if not exists client_documents (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete restrict,
  doc_type    text not null default '기타'
              check (doc_type in ('사업자등록증','계약서','통장사본','견적서','요금표','마감내역','기타')),
  filename    text not null,
  stored_path text not null,
  byte_size   bigint,
  mime        text,
  memo        text,

  is_active      boolean not null default true,
  row_version    int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references agents(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents(id),
  deactivated_at timestamptz,
  deactivated_by uuid references agents(id)
);
create index if not exists idx_document_client on client_documents(client_id) where is_active;

-- 트리거: 감사 + 삭제차단
do $$
declare t text;
begin
  foreach t in array array['client_dispatch_histories','client_settlements','client_documents']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s before insert or update on %1$s for each row execute function fn_audit()', t);
    execute format('drop trigger if exists trg_nodelete_%1$s on %1$s', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s for each row execute function fn_block_delete()', t);
  end loop;
end $$;
