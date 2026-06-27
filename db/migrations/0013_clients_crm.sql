-- ════════════════════════════════════════════════════════════════════
-- 0013_clients_crm — 거래처(주거래처) 마스터 + 담당자 + 주소록 + AI 매칭후보
--
--   배경: 주거래처는 담당자가 여러 명, 출발지/도착지가 여러 곳일 수 있다.
--         지금까지 거래처는 상담추출(conversation_extractions)의 자유텍스트였다.
--         이를 정규화하여 거래처 마스터(clients) 아래
--           · 담당자(client_contacts)  여러 명
--           · 주소록(client_addresses) 여러 개(출발지/도착지/둘다, 별칭, 담당자)
--         를 두고, 기본 출발지·결제방식·차종·요금조건을 거래처에 저장한다.
--
--   AI 매칭(client_match_candidates):
--     상담자료에서 AI가 추출한 업체명/담당자/연락처/출발지/도착지를
--     기존 거래처 데이터와 자동 매칭한다.
--       · 정확/유사 → 추천 매칭(match_type=exact|similar)
--       · 없음       → 신규 후보(match_type=new)
--     직원이 확인(confirm)하면 거래처/담당자/주소록에 저장된다.
--
--   원칙: 물리삭제 금지(is_active=false) · 모든 INSERT/UPDATE 변경이력(fn_audit).
-- ════════════════════════════════════════════════════════════════════

-- ── 거래처 마스터 ────────────────────────────────────────────────────
create table if not exists clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                 -- 거래처명(상호)
  business_no        text,                           -- 사업자등록번호
  phone              text,                           -- 대표 연락처
  -- 기본값(자주 쓰는 조건) — 접수/배차 시 자동 채움 기준
  default_payment_method text,                       -- 기본 결제방식(현금/카드/계좌이체/월말정산/선불/착불…)
  default_vehicle_type   text,                       -- 기본 차종(오토바이/다마스/라보/1톤…)
  frequent_vehicle_types text[] not null default '{}', -- 자주 쓰는 차종들
  fare_terms         text,                           -- 요금조건(기본요금/할증/계약단가 등)
  memo               text,                           -- 특이사항 메모
  -- 기본 출발지(주소록 1건). client_addresses 생성 후 아래에서 FK 추가.
  default_origin_address_id uuid,

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create index if not exists idx_clients_active on clients(is_active);
-- 한글 부분일치/유사도 검색(AI 매칭에 사용)
create index if not exists idx_clients_name_trgm on clients using gin (name gin_trgm_ops);

-- ── 담당자(거래처당 여러 명) ─────────────────────────────────────────
create table if not exists client_contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete restrict,
  name        text not null,                          -- 담당자명
  title       text,                                   -- 직책(부서/직급)
  phone       text,                                   -- 연락처
  email       text,
  is_primary  boolean not null default false,         -- 주담당자
  memo        text,

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create index if not exists idx_contacts_client on client_contacts(client_id) where is_active;
create index if not exists idx_contacts_phone_trgm on client_contacts using gin (phone gin_trgm_ops);

-- ── 주소록(거래처당 여러 개) ─────────────────────────────────────────
create table if not exists client_addresses (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete restrict,
  label         text not null,                        -- 별칭(본사/1공장/2공장/서울사무소/지방창고…)
  address       text,                                 -- 주소
  address_detail text,                                -- 상세주소
  -- 출발지/도착지 구분(둘 다 가능)
  usage_type    text not null default 'both'
                check (usage_type in ('origin','destination','both')),
  contact_name  text,                                 -- 주소별 담당자
  contact_phone text,                                 -- 주소별 연락처
  memo          text,

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create index if not exists idx_addresses_client on client_addresses(client_id) where is_active;
create index if not exists idx_addresses_label_trgm on client_addresses using gin (label gin_trgm_ops);
create index if not exists idx_addresses_addr_trgm on client_addresses using gin (address gin_trgm_ops);

-- 거래처 기본 출발지 FK(주소록 생성 후)
alter table clients
  drop constraint if exists fk_clients_default_origin;
alter table clients
  add constraint fk_clients_default_origin
  foreign key (default_origin_address_id) references client_addresses(id) on delete set null;

-- ── AI 매칭 후보 ─────────────────────────────────────────────────────
--   상담자료(conversation) 1건에서 AI가 추출한 값들을 기존 데이터와 매칭한 결과.
--   field_type 별로 한 행씩(거래처/담당자/출발지/도착지).
create table if not exists client_match_candidates (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,

  -- 후보 종류와 AI가 추출한 원문 값
  field_type      text not null
                  check (field_type in ('client','contact','origin','destination')),
  extracted_value text,                               -- 업체명/담당자명/주소 등
  extracted_phone text,                               -- 연락처(담당자/주소 매칭 보조)

  -- 매칭 결과(기존 데이터 추천)
  matched_client_id  uuid references clients(id) on delete set null,
  matched_contact_id uuid references client_contacts(id) on delete set null,
  matched_address_id uuid references client_addresses(id) on delete set null,
  match_score     numeric,                            -- 유사도 0~1
  match_type      text not null
                  check (match_type in ('exact','similar','new')),

  -- 직원 확인 상태
  status          text not null default 'pending'
                  check (status in ('pending','confirmed','rejected')),
  resolved_by     uuid references agents(id),
  resolved_at     timestamptz,
  -- 확인 결과로 생성/연결된 레코드(추적용)
  resolved_client_id  uuid references clients(id) on delete set null,
  resolved_contact_id uuid references client_contacts(id) on delete set null,
  resolved_address_id uuid references client_addresses(id) on delete set null,

  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
-- 대화×후보종류 당 활성 1건(재생성 시 갱신)
create unique index if not exists uq_match_conv_field
  on client_match_candidates(conversation_id, field_type) where is_active;
create index if not exists idx_match_status on client_match_candidates(status) where is_active;
create index if not exists idx_match_client on client_match_candidates(matched_client_id) where is_active;

-- ── 트리거: 감사(변경이력) + 삭제차단 ───────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clients','client_contacts','client_addresses','client_match_candidates']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format('create trigger trg_audit_%1$s before insert or update on %1$s for each row execute function fn_audit()', t);
    execute format('drop trigger if exists trg_nodelete_%1$s on %1$s', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s for each row execute function fn_block_delete()', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 시드 — 기존 목업(하림/리씽크)을 거래처 마스터로 이전(데모/개발용).
--   name 기준 멱등(이미 있으면 건너뜀).
-- ════════════════════════════════════════════════════════════════════
insert into clients (name, business_no, phone, default_payment_method, default_vehicle_type, frequent_vehicle_types, fare_terms, memo)
select '하림', '123-45-67890', '010-3935-2380', '월말정산', '다마스', array['다마스','1톤'], '계약단가 적용(수도권 기본 1.5만)', '신선식품 운송 다수. 냉장 차량 선호.'
where not exists (select 1 from clients where name = '하림');

insert into clients (name, business_no, phone, default_payment_method, default_vehicle_type, frequent_vehicle_types, fare_terms, memo)
select '리씽크', '211-88-12345', '010-1234-5678', '현금', '오토바이', array['오토바이'], '기본요금 적용', '오토바이 퀵 위주. 긴급 건 많음.'
where not exists (select 1 from clients where name = '리씽크');

-- 담당자
insert into client_contacts (client_id, name, title, phone, is_primary, memo)
select c.id, '김병준', '물류팀 과장', '010-3935-2380', true, '발주 담당'
from clients c where c.name = '하림'
  and not exists (select 1 from client_contacts cc where cc.client_id = c.id and cc.name = '김병준');
insert into client_contacts (client_id, name, title, phone, is_primary, memo)
select c.id, '이수민', '생산관리', '010-7777-1234', false, '공장 출고 담당'
from clients c where c.name = '하림'
  and not exists (select 1 from client_contacts cc where cc.client_id = c.id and cc.name = '이수민');
insert into client_contacts (client_id, name, title, phone, is_primary, memo)
select c.id, '박정호', '대표', '010-1234-5678', true, null
from clients c where c.name = '리씽크'
  and not exists (select 1 from client_contacts cc where cc.client_id = c.id and cc.name = '박정호');

-- 주소록
insert into client_addresses (client_id, label, address, usage_type, contact_name, contact_phone)
select c.id, '본사', '전북 익산시 망성면 망성로 1', 'both', '김병준', '010-3935-2380'
from clients c where c.name = '하림'
  and not exists (select 1 from client_addresses a where a.client_id = c.id and a.label = '본사');
insert into client_addresses (client_id, label, address, usage_type, contact_name, contact_phone)
select c.id, '1공장', '전북 정읍시 첨단산업로 100', 'origin', '이수민', '010-7777-1234'
from clients c where c.name = '하림'
  and not exists (select 1 from client_addresses a where a.client_id = c.id and a.label = '1공장');
insert into client_addresses (client_id, label, address, usage_type)
select c.id, '서울물류센터', '서울 송파구 송파대로 200', 'destination'
from clients c where c.name = '하림'
  and not exists (select 1 from client_addresses a where a.client_id = c.id and a.label = '서울물류센터');
insert into client_addresses (client_id, label, address, usage_type, contact_name, contact_phone)
select c.id, '사무실', '서울 강남구 테헤란로 50', 'both', '박정호', '010-1234-5678'
from clients c where c.name = '리씽크'
  and not exists (select 1 from client_addresses a where a.client_id = c.id and a.label = '사무실');

-- 기본 출발지 설정(하림=1공장, 리씽크=사무실)
update clients c set default_origin_address_id = a.id
from client_addresses a
where a.client_id = c.id and c.name = '하림' and a.label = '1공장'
  and c.default_origin_address_id is null;
update clients c set default_origin_address_id = a.id
from client_addresses a
where a.client_id = c.id and c.name = '리씽크' and a.label = '사무실'
  and c.default_origin_address_id is null;
