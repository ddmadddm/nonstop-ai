-- ════════════════════════════════════════════════════════════════════
-- 0005_extraction_pipeline — 업로드 자동추출 보강
--   · 검수필수 플래그: ai_confidence<70% 또는 출발지/도착지/차량종류 누락
--   · 추출 로그(extraction_logs): 시도/성공/실패/소요시간/신뢰도 기록
--   · 배차용 뷰(v_dispatch_ready_extractions): 확정(confirmed) 건만 노출
--     → "확정 전에는 배차 데이터로 사용하지 않는다" 를 구조로 강제
-- ════════════════════════════════════════════════════════════════════

-- 검수필수 플래그 + 사유
alter table conversation_extractions
  add column if not exists needs_review  boolean not null default false,
  add column if not exists review_reasons jsonb;

-- 추출 로그 (append-only) — 시도마다 1행
create table if not exists extraction_logs (
  id              bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete restrict,
  status          text not null check (status in ('success','failed')),
  model           text,
  duration_ms     int,
  avg_confidence  numeric,        -- 0~1 평균
  needs_review    boolean,
  result          jsonb,          -- 성공 시 {fields, confidence} 스냅샷
  error           text,           -- 실패 시 사유
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id)
);
create index if not exists idx_extlog_conv on extraction_logs(conversation_id, created_at desc);

drop trigger if exists trg_nodelete_extlog on extraction_logs;
create trigger trg_nodelete_extlog before delete on extraction_logs
  for each row execute function fn_block_delete();

-- 배차용: 확정된 추출만. 배차 모듈(2차)은 이 뷰만 읽는다.
create or replace view v_dispatch_ready_extractions as
  select * from conversation_extractions
  where is_active and status = 'confirmed';
