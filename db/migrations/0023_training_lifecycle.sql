-- ════════════════════════════════════════════════════════════════════
-- 0013_training_lifecycle — AI 학습 데이터 후보→확정 승격 구조
--
--   목적: 상담자료(CSV 파싱 / STT / OCR)가 들어오면 ai_training_data 에
--         'candidate'(후보)로 자동 적재하고, 직원이 추출을 '확정(confirmed)'
--         한 대화의 후보만 'confirmed'(학습데이터)로 승격한다.
--
--   분리 원칙:
--     · 원본 데이터   = raw_messages(불변) · consultation_materials.converted_text(STT/OCR 원문)
--     · 학습 데이터   = ai_training_data(파생) — candidate/confirmed/rejected 로 상태 관리
--     원본은 절대 변형하지 않고, 학습 데이터만 승격/반려한다.
--
--   라이프사이클:  candidate(후보) ──확정──▶ confirmed(승격) /  ──반려──▶ rejected
-- ════════════════════════════════════════════════════════════════════

alter table ai_training_data
  add column if not exists status text not null default 'candidate'
    check (status in ('candidate','confirmed','rejected')),
  add column if not exists source_material_id uuid references consultation_materials(id) on delete restrict,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references agents(id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references agents(id);

-- 기존 적재분(이미 운영 중인 학습데이터)은 사실상 승인된 데이터 →
--   'confirmed' 로 backfill 하여 어시스턴트 검색을 무중단 유지(이력 보존).
update ai_training_data
  set status='confirmed', confirmed_at=coalesce(confirmed_at, created_at)
  where status='candidate' and is_active;

create index if not exists idx_ai_train_status on ai_training_data(status) where is_active;
create index if not exists idx_ai_train_material on ai_training_data(source_material_id);
create index if not exists idx_ai_train_conv on ai_training_data(conversation_id);
