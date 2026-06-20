-- ════════════════════════════════════════════════════════════════════
-- 0004_extractions — 상담 데이터 구조화 (AI 자동 추출 + 직원 수정 + 변경이력)
--
--   파이프라인 위치:  raw_messages → parsed_messages → [conversation_extractions]
--                                                        └ ai_training_data
--
--   · 원본(raw_messages)은 절대 수정/삭제하지 않는다(0003 트리거로 강제).
--   · AI가 대화(conversation) 전체를 읽고 8개 항목을 추출 → 이 테이블에 저장.
--   · 직원이 값을 수정할 수 있고(현재값 컬럼), 수정은 fn_audit 트리거가
--     audit_logs 에 before/after 로 자동 기록한다(변경이력 보존).
--   · AI 원본 추출 결과(ai_extracted)는 비교/재현/학습용으로 그대로 보존.
--   · 대화 1건 = 추출 1행(활성). 재추출은 직원이 고친 필드를 덮어쓰지 않는다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists conversation_extractions (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete restrict,

  -- ── 추출 8개 항목(현재값 = 직원이 수정 가능) ───────────────────────
  client_name       text,    -- 거래처명
  manager_name      text,    -- 담당자명
  phone             text,    -- 연락처
  origin            text,    -- 출발지
  destination       text,    -- 도착지
  vehicle_type      text,    -- 차량종류 (오토바이/다마스/라보/1톤 등)
  consultation_type text,    -- 상담유형
  is_urgent         boolean, -- 긴급여부

  -- ── AI 원본 스냅샷(수정하지 않음) ──────────────────────────────────
  ai_extracted   jsonb,                              -- AI가 추출한 8개 항목 원본
  ai_confidence  jsonb,                              -- {client_name:0.93, origin:0.7, ...} 0~1
  ai_model       text,                               -- claude-haiku-4-5 등
  -- 필드별 출처: {"origin":"human","phone":"ai", ...} — 직원이 고친 필드 추적
  field_sources  jsonb not null default '{}'::jsonb,

  -- ── 상태/검수 ──────────────────────────────────────────────────────
  status text not null default 'pending'
         check (status in ('pending','extracted','edited','confirmed','failed')),
  reviewed_by uuid references agents(id),
  reviewed_at timestamptz,
  error       text,

  -- ── 공통 표준(감사/버전/비활성화) ──────────────────────────────────
  source_system  text not null default 'chatlog',
  is_active      boolean not null default true,
  row_version    int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references agents(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents(id),
  deactivated_at timestamptz,
  deactivated_by uuid references agents(id)
);

-- 대화당 활성 추출 1건
create unique index if not exists uq_extraction_conv
  on conversation_extractions(conversation_id) where is_active;
create index if not exists idx_extraction_status on conversation_extractions(status);
create index if not exists idx_extraction_urgent
  on conversation_extractions(is_urgent) where is_active and is_urgent;

-- 트리거: 감사(INSERT/UPDATE → audit_logs, 변경이력) + 삭제차단
drop trigger if exists trg_audit_extractions on conversation_extractions;
create trigger trg_audit_extractions before insert or update on conversation_extractions
  for each row execute function fn_audit();
drop trigger if exists trg_nodelete_extractions on conversation_extractions;
create trigger trg_nodelete_extractions before delete on conversation_extractions
  for each row execute function fn_block_delete();
