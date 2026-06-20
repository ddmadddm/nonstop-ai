-- ════════════════════════════════════════════════════════════════════
-- 0003_chatlog_pipeline — 카카오 상담톡 원본 업로드 → 학습 데이터 3계층
--
--   원칙(요청사항):
--     · 원본 데이터 절대 수정 금지 / 삭제 금지  → raw_messages 에 INSERT-only,
--       fn_block_update + fn_block_delete 트리거로 강제.
--     · 원본 파일 그대로 보관                    → chat_upload_batches.stored_path
--     · UTF-8 한글 보존                          → 파서가 utf-8 로 디코드, 원문 raw 보존
--     · 중복 업로드 차단                          → file_hash 유니크 + row_hash 유니크
--     · 업로드 로그 저장                          → chat_upload_batches
--
--   파이프라인:  raw_messages → parsed_messages → ai_training_data
--     raw     : 원본 1행 = 1행(불변)
--     parsed  : sender_type 자동분류(논스톱서비스=staff, 그 외=customer) + 대화 그룹화 + 시각 파싱
--     ai      : (고객 발화) → (직원 응답) 학습 쌍. parsed 에서 파생(재생성 가능).
-- ════════════════════════════════════════════════════════════════════

-- ── (1) 업로드 배치 = 이력/로그 (파일 1개 = 배치 1개) ─────────────────
create table if not exists chat_upload_batches (
  id                 uuid primary key default gen_random_uuid(),
  filename           text not null,
  file_type          text not null check (file_type in ('xlsx','csv')),
  file_hash          text not null,                 -- sha256(파일 내용) — 동일 파일 재업로드 차단
  byte_size          bigint,
  stored_path        text,                          -- 원본 파일 보관 경로(.data/uploads/…; 추후 Supabase Storage)
  total_rows         int not null default 0,        -- 파일 내 데이터 행 수(헤더 제외)
  raw_rows           int not null default 0,        -- raw_messages 적재 건수
  parsed_rows        int not null default 0,        -- parsed_messages 생성 건수
  conversation_count int not null default 0,
  training_count     int not null default 0,        -- ai_training_data 생성 건수
  status             text not null default 'done'
                     check (status in ('done','partial','failed')),
  error              text,
  created_at         timestamptz not null default now(),
  created_by         uuid references agents(id)
);
create unique index if not exists uq_chat_batch_hash on chat_upload_batches(file_hash);

-- ── (2) 원본 메시지 (messages_raw) — 불변(append-only) ─────────────────
create table if not exists raw_messages (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references chat_upload_batches(id) on delete restrict,
  row_index   int not null,                         -- 파일 내 데이터 행 순서(0-base)
  raw         jsonb not null,                        -- 원본 행 전체(헤더→값) 그대로
  date_raw    text,                                  -- 원본 DATE 셀 문자열 그대로
  user_raw    text,                                  -- 원본 USER 그대로
  message_raw text,                                  -- 원본 MESSAGE 그대로
  row_hash    text not null,                         -- sha256(file_hash:row_index) — 행 중복 차단
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_raw_row on raw_messages(row_hash);
create index if not exists idx_raw_batch on raw_messages(batch_id, row_index);

-- ── (3) 대화(자동 그룹화) — 정제 계층 ─────────────────────────────────
create table if not exists conversations (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid references chat_upload_batches(id) on delete restrict,
  title            text,                             -- 파일명/세션 라벨
  channel          text not null default 'kakao',
  source_system    text not null default 'chatlog',
  message_count    int not null default 0,
  first_message_at timestamptz,
  last_message_at  timestamptz,
  is_active        boolean not null default true,
  row_version      int not null default 1,
  created_at       timestamptz not null default now(),
  created_by       uuid references agents(id),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references agents(id),
  deactivated_at   timestamptz,
  deactivated_by   uuid references agents(id)
);
create index if not exists idx_conv_lastmsg on conversations(last_message_at desc) where is_active;
create index if not exists idx_conv_batch on conversations(batch_id);

-- ── (4) 정제 메시지 — sender_type 분류 + 대화 연결 + 시각 파싱 ─────────
create table if not exists parsed_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,
  raw_message_id  uuid not null references raw_messages(id) on delete restrict,
  seq             int not null,                      -- 대화 내 순서
  sender_type     text not null check (sender_type in ('staff','customer','system')),
  sender_name     text,
  content         text,                              -- 원본 message 보존(가공 없음)
  sent_at         timestamptz,                       -- 파싱 성공 시. 실패 시 null(raw 에 원문 보존)
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_parsed_raw on parsed_messages(raw_message_id);  -- raw 1행 = parsed 1행(멱등)
create index if not exists idx_parsed_conv on parsed_messages(conversation_id, seq);
create index if not exists idx_parsed_content_trgm on parsed_messages using gin (content gin_trgm_ops);

-- ── (5) AI 학습 데이터 — 별도 계층(parsed 에서 파생) ──────────────────
--   과거 상담 패턴: (직전 고객 발화 묶음) → (직원 응답) 쌍.
create table if not exists ai_training_data (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete restrict,
  kind            text not null default 'qa_pair'    -- qa_pair | transcript
                  check (kind in ('qa_pair','transcript')),
  input_text      text,                              -- 직전 고객 발화(들)
  output_text     text,                              -- 직원 응답
  context         jsonb,                             -- 재현용 메타(메시지 id·시각 등)
  source_system   text not null default 'chatlog',
  dedup_hash      text,                              -- 동일 쌍 재생성 중복 차단
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id)
);
create unique index if not exists uq_ai_train_dedup on ai_training_data(dedup_hash) where dedup_hash is not null;
create index if not exists idx_ai_train_conv on ai_training_data(conversation_id);

-- ── 트리거 부착 ───────────────────────────────────────────────────────
-- raw_messages: 원본 불변 — 수정·삭제 모두 차단
drop trigger if exists trg_noupdate_raw on raw_messages;
create trigger trg_noupdate_raw before update on raw_messages
  for each row execute function fn_block_update();
drop trigger if exists trg_nodelete_raw on raw_messages;
create trigger trg_nodelete_raw before delete on raw_messages
  for each row execute function fn_block_delete();

-- chat_upload_batches: 로그 — 삭제 차단(집계 컬럼 update 는 허용)
drop trigger if exists trg_nodelete_batch on chat_upload_batches;
create trigger trg_nodelete_batch before delete on chat_upload_batches
  for each row execute function fn_block_delete();

-- conversations: 표준 — 감사 + 삭제차단
drop trigger if exists trg_audit_conversations on conversations;
create trigger trg_audit_conversations before insert or update on conversations
  for each row execute function fn_audit();
drop trigger if exists trg_nodelete_conversations on conversations;
create trigger trg_nodelete_conversations before delete on conversations
  for each row execute function fn_block_delete();

-- parsed_messages / ai_training_data: 파생(재생성 가능)이지만 운영 중 임의삭제 차단
drop trigger if exists trg_nodelete_parsed on parsed_messages;
create trigger trg_nodelete_parsed before delete on parsed_messages
  for each row execute function fn_block_delete();
drop trigger if exists trg_nodelete_aitrain on ai_training_data;
create trigger trg_nodelete_aitrain before delete on ai_training_data
  for each row execute function fn_block_delete();
