-- ════════════════════════════════════════════════════════════════════
-- 0001_core — 공통 인프라 (확장 · 직원 · 감사 · 공통 함수/트리거)
--   [09 ERP DB·아키텍처] 6대 원칙의 DB 구현 기반.
--   표준 PostgreSQL 기준(Supabase 비종속). Auth/Storage/RLS는 후속 단계 자리만 준비.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- 한글 부분일치 검색
-- 임베딩(RAG, P4)에서: create extension if not exists vector;

-- ── 직원(상담원/접수/배차/관리자) — 등록자·검수자·승인자 ─────────────
create table if not exists agents (
  id             uuid primary key default gen_random_uuid(),
  auth_uid       uuid unique,                       -- ① Supabase auth.users 연계(로그인/RLS 도입 대비)
  name           text not null,
  team           text not null default 'reception'
                 check (team in ('reception','dispatch','admin')),
  phone          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  deactivated_at timestamptz
);

-- ── ⑤ 변경 이력: 전 테이블 공용 감사 로그 ────────────────────────────
create table if not exists audit_logs (
  id          bigserial primary key,
  table_name  text not null,
  row_id      uuid not null,
  action      text not null check (action in ('INSERT','UPDATE','DEACTIVATE')),
  changed_by  uuid references agents(id),
  before      jsonb,
  after       jsonb,
  changed_at  timestamptz not null default now()
);
create index if not exists idx_audit_row on audit_logs(table_name, row_id, changed_at desc);

-- ── 감사 트리거 함수: INSERT/UPDATE 시 before/after 적재 ⑤ ─────────────
--   (표준 공통 컬럼 row_version/updated_at/updated_by/is_active 가 있는 테이블에만 부착)
create or replace function fn_audit() returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE') then
    new.updated_at  := now();
    new.row_version := old.row_version + 1;
    insert into audit_logs(table_name, row_id, action, changed_by, before, after)
    values (tg_table_name, new.id,
            case when new.is_active = false and old.is_active = true
                 then 'DEACTIVATE' else 'UPDATE' end,
            new.updated_by, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'INSERT') then
    insert into audit_logs(table_name, row_id, action, changed_by, before, after)
    values (tg_table_name, new.id, 'INSERT', new.created_by, null, to_jsonb(new));
    return new;
  end if;
  return new;
end $$;

-- ── ② 물리삭제 차단: 어떤 DELETE도 거부 ───────────────────────────────
create or replace function fn_block_delete() returns trigger language plpgsql as $$
begin
  raise exception 'DELETE 금지 테이블입니다(%). is_active=false 로 비활성화하세요.', tg_table_name;
end $$;

-- ── 원본 보존: UPDATE 차단(raw 계층 전용) ─────────────────────────────
create or replace function fn_block_update() returns trigger language plpgsql as $$
begin
  raise exception '원본 보존 테이블입니다(%). 수정할 수 없습니다.', tg_table_name;
end $$;

-- ── ④ "삭제" = 비활성화 함수 ──────────────────────────────────────────
create or replace function fn_deactivate(p_table regclass, p_id uuid, p_by uuid)
returns void language plpgsql as $$
begin
  execute format(
    'update %s set is_active=false, deactivated_at=now(), deactivated_by=$2, updated_by=$2 where id=$1 and is_active',
    p_table) using p_id, p_by;
end $$;

-- ── 트리거 부착 ───────────────────────────────────────────────────────
-- agents: 표준 공통 컬럼이 없으므로 감사 트리거는 부착하지 않고, 삭제만 차단.
drop trigger if exists trg_nodelete_agents on agents;
create trigger trg_nodelete_agents before delete on agents
  for each row execute function fn_block_delete();
