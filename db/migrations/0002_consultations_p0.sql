-- ════════════════════════════════════════════════════════════════════
-- 0002_consultations_p0 — 상담 CRM(이미지 업로드) 코어
--   기존 MVP(.data/consultations.json)를 그대로 옮겨 담는 최소 스키마.
--   거래처/담당자/유형은 P1에서 마스터 테이블 FK로 확장 예정(현재는 자유텍스트).
--   검수·이미지(consultation_images)·OCR·AI 필드는 P2~P4에서 ALTER로 증설.
-- ════════════════════════════════════════════════════════════════════

create table if not exists consultations (
  id               uuid primary key default gen_random_uuid(),

  -- P0: 자유텍스트(P1에서 client_id/contact_id/category_id FK로 이전)
  client_name      text,
  manager_name     text,
  consultation_type text,
  content_original text,                            -- 상담내용 원문(가공 금지, 줄바꿈 보존)
  channel          text not null default 'manual'
                   check (channel in ('manual','kakao','phone')),
  image_urls       text[] not null default '{}',    -- 상담 캡처 경로(P2에서 consultation_images 행으로 이전)

  process_status   text not null default 'received'
                   check (process_status in ('received','in_progress','answered','closed','hold')),

  -- 공통 표준 컬럼(② ④ ⑤ + ① 인성 2차 자리)
  source_system    text not null default 'nonstop', -- 'nonstop' | 'nonstop_mvp'(이관분) | 'insung'
  external_id      text,                            -- ① 외부/원본 키
  is_active        boolean not null default true,
  row_version      int not null default 1,
  created_at       timestamptz not null default now(),
  created_by       uuid references agents(id),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references agents(id),
  deactivated_at   timestamptz,
  deactivated_by   uuid references agents(id)
);

-- ① 동기화 멱등 키(2차 인성 매핑 대비) + 이관 중복 차단
create unique index if not exists uq_consultations_external
  on consultations(source_system, external_id) where external_id is not null;
create index if not exists idx_consult_status  on consultations(process_status);
create index if not exists idx_consult_created on consultations(created_at desc) where is_active;
create index if not exists idx_consult_content_trgm
  on consultations using gin (content_original gin_trgm_ops);   -- 한글 부분검색

-- 트리거: 감사 + 삭제차단
drop trigger if exists trg_audit_consultations on consultations;
create trigger trg_audit_consultations before insert or update on consultations
  for each row execute function fn_audit();
drop trigger if exists trg_nodelete_consultations on consultations;
create trigger trg_nodelete_consultations before delete on consultations
  for each row execute function fn_block_delete();
