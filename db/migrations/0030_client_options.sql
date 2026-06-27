-- ════════════════════════════════════════════════════════════════════
-- 0030_client_options — 거래처 항목(드롭다운) 관리 + 관계/유입 구분
--   거래처 관련 선택값을 코드 상수가 아닌 DB에서 직원이 직접 관리(추가/수정/비활성화).
--   관계/유입 구분(relationship)은 신규 필드로 거래처에 저장.
--   원칙: 물리삭제 금지(is_active=false) · 변경이력 fn_audit. 사용중 항목도 삭제 불가(비활성화만).
-- ════════════════════════════════════════════════════════════════════

create table if not exists client_option_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,   -- relationship | client_type | payment | contact_role | address_category | address_verify | client_status
  name        text not null,          -- 표시명
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  row_version int not null default 1,
  created_at  timestamptz not null default now(),
  created_by  uuid references agents(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);

create table if not exists client_options (
  id           uuid primary key default gen_random_uuid(),
  category_key text not null references client_option_categories(key) on delete restrict,
  label        text not null,
  value        text not null,
  color        text,
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  row_version  int not null default 1,
  created_at   timestamptz not null default now(),
  created_by   uuid references agents(id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create index if not exists idx_options_cat on client_options(category_key) where is_active;
create unique index if not exists uq_options_cat_value on client_options(category_key, value);

-- 관계/유입 구분(client_options.value 참조, 자유텍스트). null = 미분류.
alter table clients add column if not exists relationship_type text;
create index if not exists idx_clients_relationship on clients(relationship_type) where is_active;

-- 트리거: 감사 + 삭제차단
do $$ declare t text; begin
  foreach t in array array['client_option_categories','client_options'] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s before insert or update on %1$s for each row execute function fn_audit()', t);
    execute format('drop trigger if exists trg_nodelete_%1$s on %1$s', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s for each row execute function fn_block_delete()', t);
  end loop;
end $$;

-- ── seed: 카테고리 ───────────────────────────────────────────────────
insert into client_option_categories (key, name, sort_order) values
  ('relationship','관계/유입 구분',1),
  ('client_type','거래처 구분',2),
  ('payment','결제방식',3),
  ('contact_role','담당자 역할',4),
  ('address_category','주소 카테고리',5),
  ('address_verify','주소 확인상태',6),
  ('client_status','거래처 상태',7)
on conflict (key) do nothing;

-- ── seed: 항목 ───────────────────────────────────────────────────────
insert into client_options (category_key, label, value, sort_order)
select cat, v, v, ord from (values
  ('relationship','BNI',1),('relationship','서울대',2),('relationship','지인',3),
  ('relationship','소개',4),('relationship','기존거래',5),('relationship','카카오채널',6),
  ('relationship','홈페이지',7),('relationship','광고',8),('relationship','기타',9),
  ('client_type','주거래처',1),('client_type','일반거래처',2),('client_type','휴면',3),
  ('payment','현금',1),('payment','카드',2),('payment','월말정산',3),('payment','착불',4),('payment','선불',5),('payment','기타',6),
  ('contact_role','배차담당',1),('contact_role','결제담당',2),('contact_role','현장담당',3),
  ('contact_role','야간담당',4),('contact_role','대표담당',5),('contact_role','기타',6),
  ('address_category','본사',1),('address_category','공장',2),('address_category','창고',3),
  ('address_category','1공장',4),('address_category','2공장',5),('address_category','현장',6),('address_category','기타',7),
  ('address_verify','확인완료',1),('address_verify','확인필요',2),
  ('client_status','정상',1),('client_status','주의',2),('client_status','거래중단',3)
) as t(cat,v,ord)
on conflict (category_key, value) do nothing;
