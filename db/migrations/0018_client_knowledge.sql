-- ════════════════════════════════════════════════════════════════════
-- 0018_client_knowledge — ⑦ 거래처 지식베이스 자동 구축
--
--   분리·추출·매칭 결과를 거래처별로 집계해 '거래처 지식'으로 축적한다.
--     · 자주 쓰는 출발지/도착지, 자주 쓰는 차종, 담당자, 상담유형, 상담 빈도/기간
--   파생물(원본 불변). kind 별 1행(MVP: 'summary'). 재구축 시 활성본 비활성화 후 재적재.
-- ════════════════════════════════════════════════════════════════════

create table if not exists client_knowledge (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete restrict,
  kind          text not null default 'summary',  -- summary (추후 frequent_origin 등 세분화)
  value         jsonb not null default '{}'::jsonb, -- 집계 결과
  evidence      jsonb not null default '{}'::jsonb, -- 근거(출처 대화/세그먼트 등)
  source_count  int,                                -- 집계에 쓰인 상담 단위 수
  period_start  timestamptz,
  period_end    timestamptz,

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create unique index if not exists uq_knowledge_client_kind
  on client_knowledge(client_id, kind) where is_active;

drop trigger if exists trg_audit_client_knowledge on client_knowledge;
create trigger trg_audit_client_knowledge before insert or update on client_knowledge
  for each row execute function fn_audit();
drop trigger if exists trg_nodelete_client_knowledge on client_knowledge;
create trigger trg_nodelete_client_knowledge before delete on client_knowledge
  for each row execute function fn_block_delete();
