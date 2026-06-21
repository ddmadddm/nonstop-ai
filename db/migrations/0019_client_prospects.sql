-- ════════════════════════════════════════════════════════════════════
-- 0019_client_prospects — 논사원 답변에서 '신규 거래처 후보' 저장
--
--   자동판단이 신규 거래처로 판단(기존 거래처 DB 미매칭 + 거래처명/연락처 식별)하면
--   문의에서 추출한 식별정보를 거래처 후보로 적재한다. 직원이 검토 후 거래처로 승격.
--   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit.
-- ════════════════════════════════════════════════════════════════════

create table if not exists client_prospects (
  id            uuid primary key default gen_random_uuid(),
  name          text,                 -- 추출된 거래처명
  manager_name  text,
  phone         text,
  origin        text,
  destination   text,
  question      text,                 -- 출처 문의 원문
  source        text not null default 'assistant',
  status        text not null default 'new'
                check (status in ('new','reviewed','converted','rejected')),
  client_id     uuid references clients(id),  -- 승격 시 연결된 거래처

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create index if not exists idx_prospect_status on client_prospects(status) where is_active;
create index if not exists idx_prospect_phone_trgm on client_prospects using gin (phone gin_trgm_ops);

drop trigger if exists trg_audit_client_prospects on client_prospects;
create trigger trg_audit_client_prospects before insert or update on client_prospects
  for each row execute function fn_audit();
drop trigger if exists trg_nodelete_client_prospects on client_prospects;
create trigger trg_nodelete_client_prospects before delete on client_prospects
  for each row execute function fn_block_delete();
