-- ════════════════════════════════════════════════════════════════════
-- 0015_conversation_segments — 대형 채팅방 ① 자동분석 + ⑤ 상담 단위 분리 저장
--
--   원본(raw/parsed)은 불변. 여기서 만드는 것은 모두 '파생물'(분석/분리본)이다.
--   · chat_archive_analysis : ① 자동 분석(거래처 추정·기간·참여자) 결과
--   · conversation_segments : ⑤ 상담 단위(세그먼트) — segmentChatMessages() 결과 저장
--
--   원칙: 물리삭제 금지(is_active=false) · 모든 INSERT/UPDATE 변경이력(fn_audit).
--   재실행(재분석/재분리): 기존 활성 행을 비활성화하고 새로 적재(원본은 그대로).
-- ════════════════════════════════════════════════════════════════════

-- ① 자동 분석 결과(대화당 활성 1건)
create table if not exists chat_archive_analysis (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,

  client_guess    text,                         -- ② 거래처 추정(상호/대표 발화자)
  client_id       uuid references clients(id),  -- 기존 거래처 매칭(있으면)
  client_score    numeric,                      -- 매칭 유사도 0~1

  period_start    timestamptz,                  -- ③ 기간
  period_end      timestamptz,
  active_days     int,
  message_total   int,

  participants    jsonb not null default '[]'::jsonb,  -- ④ 참여자 [{name,type,count}]
  summary         jsonb not null default '{}'::jsonb,

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create unique index if not exists uq_archive_analysis_conv
  on chat_archive_analysis(conversation_id) where is_active;

-- ⑤ 상담 단위(세그먼트)
create table if not exists conversation_segments (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,
  seq             int not null,            -- 방 내 순번(0-base)
  start_seq       int not null,            -- 포함 시작 parsed_messages.seq
  end_seq         int not null,            -- 포함 끝 seq
  message_count   int not null,
  started_at      timestamptz,
  ended_at        timestamptz,
  triggers        jsonb not null default '[]'::jsonb,  -- 분리 사유 [gap,dispatch,intake,sender,start]
  signals         jsonb not null default '{}'::jsonb,  -- {intake,order,dispatch}
  client_hint     text,                    -- 추정 고객(발화자)

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create unique index if not exists uq_segment_conv_seq
  on conversation_segments(conversation_id, seq) where is_active;
create index if not exists idx_segment_conv
  on conversation_segments(conversation_id) where is_active;

-- 트리거: 감사(변경이력) + 삭제차단
do $$
declare t text;
begin
  foreach t in array array['chat_archive_analysis','conversation_segments']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s before insert or update on %1$s for each row execute function fn_audit()', t);
    execute format('drop trigger if exists trg_nodelete_%1$s on %1$s', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s for each row execute function fn_block_delete()', t);
  end loop;
end $$;
