-- ════════════════════════════════════════════════════════════════════
-- 0020_assistant_drafts_search — 논사원 답변 검색/리스트(어드민)용 컬럼
--
--   기존 답변(assistant_drafts)에 거래처 인식 결과 + 검색용 비정규화 컬럼을 추가한다.
--   원본 jsonb(extracted/confidence/used_sources)는 그대로 두고, 검색·표시용 컬럼을 별도로 둔다.
-- ════════════════════════════════════════════════════════════════════

alter table assistant_drafts
  add column if not exists client_mode text
    check (client_mode in ('general','key_client','new_candidate')),
  add column if not exists recognized_client_id uuid references clients(id),
  add column if not exists recognition_confidence numeric,
  add column if not exists client_name text,   -- 매칭 거래처명 또는 추출 거래처명(검색/표시)
  add column if not exists manager_name text,
  add column if not exists phone text;

-- 백필: 기존 행은 extracted jsonb 에서 검색용 컬럼 채움
update assistant_drafts set
  client_name  = coalesce(client_name, nullif(extracted->>'client_name','')),
  manager_name = coalesce(manager_name, nullif(extracted->>'manager_name','')),
  phone        = coalesce(phone, nullif(extracted->>'phone',''))
where extracted is not null;

create index if not exists idx_drafts_created on assistant_drafts(created_at desc) where is_active;
create index if not exists idx_drafts_mode on assistant_drafts(client_mode) where is_active;
create index if not exists idx_drafts_client_trgm on assistant_drafts using gin (client_name gin_trgm_ops);
