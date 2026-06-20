# 09. ERP 데이터베이스 구조 & 시스템 아키텍처 (통합 설계)

> 본 문서는 [01 아키텍처](01-architecture.md)·[02 DB 스키마](02-database-schema.md)·[08 도메인 모델](08-domain-model.md)을 **6대 운영 원칙**과 **3단계 로드맵 전체 범위**로 재정리한 상위 설계다.
> 기존 문서를 폐기하지 않는다. 다만 기존 `02` 스키마의 `on delete cascade`는 본 문서의 **"삭제 금지·누적" 원칙과 충돌**하므로 본 문서 기준으로 교체한다.

---

## 0. 6대 원칙 → DB/아키텍처 구현 매핑

설계의 출발점. 모든 테이블·정책이 이 표를 따른다.

| 원칙 | 구현 패턴 | 강제 방법 |
|------|-----------|-----------|
| **① 인성프로그램 대체 금지·연동** | 인성은 SoR(System of Record) 유지. 우리는 **읽기 위주 동기화 + 매핑 테이블**. 양방향 쓰기는 검증된 항목만 단방향 push. | `external_refs` 매핑 테이블, `source_system` 컬럼, `integration_*` 스테이징 |
| **② 기존 데이터 삭제 금지** | **물리 삭제(DELETE) 전면 금지.** FK는 `cascade` 대신 `restrict`/`set null`. | DB 권한에서 앱 롤의 DELETE 회수, 코드 리뷰 규칙 |
| **③ 모든 데이터 누적** | 상태 변화는 **이벤트로 append**(상태 컬럼은 현재값 캐시). 메시지·오더·배차·운임은 append-only. | `*_events` 테이블, INSERT-only 패턴 |
| **④ 삭제 대신 비활성화** | 모든 마스터 테이블에 `is_active` + `deactivated_at`/`deactivated_by`. 조회는 기본 `is_active=true` 필터. | 공통 컬럼 + 뷰(`v_active_*`) |
| **⑤ 변경 이력 저장** | 모든 UPDATE를 **트리거로 `audit_logs`에 before/after(jsonb) 기록**. 핵심 테이블은 행 버전(`row_version`). | `fn_audit()` 트리거, `audit_logs` |
| **⑥ 상담 챗봇 최우선** | 1단계 스키마(상담·메시지·OCR·AI초안)를 먼저 완성·배포. 2·3단계는 같은 DB에 모듈로 증설. | 마이그레이션 분할(`0001~`), 모듈별 스키마 네임스페이스 |

### 공통 컬럼 표준 (모든 업무 테이블에 부착)

```sql
-- 모든 마스터/트랜잭션 테이블이 공유하는 표준 컬럼
  id            uuid primary key default gen_random_uuid(),
  is_active     boolean      not null default true,        -- ④ 비활성화
  row_version   int          not null default 1,           -- ⑤ 낙관적 잠금/버전
  source_system text         not null default 'nonstop',   -- ① 'insung' | 'kakao' | 'nonstop'
  external_id   text,                                       -- ① 인성/외부 원본 키
  created_at    timestamptz  not null default now(),
  created_by    uuid references agents(id),
  updated_at    timestamptz  not null default now(),
  updated_by    uuid references agents(id),
  deactivated_at timestamptz,                               -- ④ 비활성 시각(삭제 대용)
  deactivated_by uuid references agents(id)
```

> **규칙**: 어떤 행도 DELETE 하지 않는다. "삭제"는 `is_active=false, deactivated_at=now()` UPDATE다.

---

## 1. 시스템 아키텍처 (인성 연동 포함)

```
┌────────────────┐        ┌──────────────────────────┐
│  카카오 상담톡  │        │   인성프로그램 (기존 ERP) │  ← SoR 유지, 대체 안 함
│  (전화/카톡 주문)│        │   거래처/단가/정산 원장   │
└───────┬────────┘        └──────────┬───────────────┘
        │ 웹훅(수신)                  │ ① 연동 (읽기 위주)
        │                            │  - DB 직접 read(가능 시) / CSV·Excel export / 수기 import
        ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    Next.js (App Router) — 모듈형 모놀리스       │
│                                                                │
│  [상담 모듈 ★1차]   app/api/kakao/webhook  ← 빠른 저장(ack)    │
│                     app/api/ocr/process    ← 이미지 OCR        │
│                     app/api/ai/classify    ← 거래처/유형 자동분류│
│                     app/api/ai/draft       ← 논사원 AI 답변초안 │
│                     app/api/kakao/send     ← 상담원 발송        │
│  [배차 모듈 2차]    app/api/orders·dispatch·drivers·fares       │
│  [정산 모듈 3차]    app/api/settlements·invoices                │
│  [연동 모듈]        app/api/integration/insung/{import,sync}    │
└───────┬──────────────────────┬──────────────────┬─────────────┘
        ▼                      ▼                  ▼
┌────────────────┐   ┌──────────────────┐  ┌──────────────────┐
│  PostgreSQL    │   │  AI (Claude API) │  │  OCR 엔진         │
│  - 업무 스키마  │   │  - 분류/추출/초안 │  │  - Naver CLOVA /  │
│  - pgvector    │   │  - 임베딩         │  │    Google Vision/ │
│  - 감사/이력    │   │   (RAG)          │  │    Tesseract      │
│  - 연동 스테이징│   └──────────────────┘  └──────────────────┘
│  - Storage(첨부)│
└────────────────┘
```

### 인성 연동 3원칙
1. **방향**: 기본 **인성 → 논스톱(읽기)**. 거래처·단가·정산 원장은 인성이 진실. 우리는 사본 + 상담/오더 데이터를 덧붙인다.
2. **격리**: 외부 데이터는 먼저 `integration_staging`(원본 그대로)에 적재 → 검증 → 우리 마스터에 **upsert by `external_id`**. 인성 원본을 직접 수정하지 않는다.
3. **추적**: 모든 동기화는 `integration_sync_logs`에 배치 단위로 기록(언제·몇 건·성공/실패). 충돌 시 사람이 판단.

> 인성 연동 형태(직접 DB 접근 / 파일 export / API 유무)는 **현장 확인 필요**. 어느 쪽이든 `lib/integration/insung/` 어댑터에서 차이를 흡수하고, 들어오는 데이터 모양(staging→master)은 동일하게 둔다.

---

## 2. 도메인별 스키마

마이그레이션 분할: `0001_core` → `0002_consult` → `0003_dispatch` → `0004_settlement` → `0005_integration`.
1차 배포는 `0001`+`0002`만으로 동작한다.

### 2-A. 공통/감사 (`0001_core`)

```sql
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector
create extension if not exists pg_trgm;    -- 한글 부분일치

-- 상담원/직원 (접수팀·배차팀·관리자)
create table agents (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid unique,                          -- Supabase auth.users 연계(선택)
  name        text not null,
  team        text not null default 'reception'     -- reception(접수) | dispatch(배차) | admin
              check (team in ('reception','dispatch','admin')),
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  deactivated_at timestamptz
);

-- ⑤ 변경 이력: 전 테이블 공용 감사 로그
create table audit_logs (
  id          bigserial primary key,
  table_name  text not null,
  row_id      uuid not null,
  action      text not null check (action in ('INSERT','UPDATE','DEACTIVATE')),
  changed_by  uuid references agents(id),
  before      jsonb,
  after       jsonb,
  changed_at  timestamptz not null default now()
);
create index idx_audit_row on audit_logs(table_name, row_id, changed_at desc);

-- 감사 트리거 함수: INSERT/UPDATE 시 before/after 적재
create or replace function fn_audit() returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE') then
    new.updated_at := now();
    new.row_version := old.row_version + 1;
    insert into audit_logs(table_name,row_id,action,changed_by,before,after)
    values (tg_table_name, new.id,
            case when new.is_active=false and old.is_active=true then 'DEACTIVATE' else 'UPDATE' end,
            new.updated_by, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'INSERT') then
    insert into audit_logs(table_name,row_id,action,changed_by,before,after)
    values (tg_table_name, new.id, 'INSERT', new.created_by, null, to_jsonb(new));
    return new;
  end if;
end $$;

-- 물리삭제 차단 트리거(②): 어떤 DELETE도 거부
create or replace function fn_block_delete() returns trigger language plpgsql as $$
begin
  raise exception 'DELETE 금지 테이블입니다(%). is_active=false 로 비활성화하세요.', tg_table_name;
end $$;
```

> 각 업무 테이블 생성 직후 `create trigger ... before insert or update ... execute fn_audit()` 와 `before delete ... execute fn_block_delete()` 를 부착한다(아래 예시).

### 2-B. 상담 모듈 ★1차 (`0002_consult`)

```sql
-- 거래처 (인성과 매핑)
create table clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  business_no   text,
  phone         text,
  memo          text,
  -- 표준 공통 컬럼
  is_active     boolean not null default true,
  row_version   int not null default 1,
  source_system text not null default 'nonstop',     -- ① 인성에서 온 거래처는 'insung'
  external_id   text,                                 -- ① 인성 거래처코드
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);
create unique index uq_clients_external on clients(source_system, external_id)
  where external_id is not null;                      -- ① 동기화 멱등 upsert 키

-- 거래처 담당자 (조용호/김병준 등)
create table client_contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete restrict,  -- ② cascade 금지
  name        text not null,
  position    text,
  phone       text,
  kakao_user_key text,                                -- 카톡 사용자키로 담당자 자동 매칭
  is_primary  boolean not null default false,
  is_active   boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);

-- 상담 고객(카카오 사용자) — 담당자와 연결
create table customers (
  id            uuid primary key default gen_random_uuid(),
  kakao_user_key text unique,
  name          text, phone text,
  client_id     uuid references clients(id) on delete set null,        -- 거래처 미매칭 허용
  contact_id    uuid references client_contacts(id) on delete set null,
  is_active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 상담유형(계층형) — docs/07 트리
create table categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete restrict,
  code        text unique,                            -- seed 안정 키
  name        text not null,
  description text,                                   -- AI 분류 프롬프트에 사용
  sort_order  int default 0,
  is_active   boolean not null default true
);

-- 상담 세션
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete restrict,
  client_id     uuid references clients(id) on delete set null,        -- 비정규화(조회 편의)
  category_id   uuid references categories(id) on delete set null,     -- 자동분류 결과(현재값)
  status        text not null default 'open' check (status in ('open','pending','closed')),
  assigned_agent_id uuid references agents(id) on delete set null,
  channel       text not null default 'kakao',
  title         text,                                 -- "하림신선/김병준님"
  last_message_at timestamptz,
  is_active     boolean not null default true,        -- ④ '닫기'와 '비활성'은 별개
  row_version   int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);

-- 메시지 (append-only ③)
create table messages (
  id            uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,
  sender_type   text not null check (sender_type in ('customer','agent','ai','system')),
  sender_agent_id uuid references agents(id) on delete set null,
  content       text,
  attachments   jsonb,                                -- [{kind,url,storage_path}]
  raw_payload   jsonb,                                -- 카카오 원본(감사·멱등)
  external_msg_id text,                               -- 카카오 메시지 고유ID(중복차단)
  embedding     vector(1536),                         -- RAG/검색(모델 차원 일치)
  sent_at       timestamptz,                          -- 카카오 기준 시각
  created_at    timestamptz not null default now()
);
create unique index uq_messages_external on messages(external_msg_id)
  where external_msg_id is not null;                  -- 멱등 수신

-- 상담 이미지 OCR 결과 (오더 캡처/지도/영수증 이미지)
create table message_ocr (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references messages(id) on delete restrict,
  storage_path  text not null,                        -- 원본 이미지
  engine        text,                                 -- 'clova' | 'gvision' | 'tesseract'
  raw_text      text,                                 -- OCR 전체 텍스트
  blocks        jsonb,                                -- 좌표·신뢰도 포함 블록
  extracted     jsonb,                                -- 구조화 추출(출발/도착/물품/차종 등)
  status        text not null default 'pending'
                check (status in ('pending','done','failed','review')),
  embedding     vector(1536),                         -- OCR 텍스트도 검색 대상
  created_at    timestamptz not null default now()
);

-- 논사원 AI 답변초안 이력 (③ 채택/수정 누적 → 학습)
create table ai_responses (
  id            uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,
  trigger_message_id uuid references messages(id) on delete set null,
  model         text,                                 -- claude-haiku-4-5 등
  generated_answer text,
  used_faq_ids  uuid[],
  confidence    numeric,
  status        text not null default 'draft'
                check (status in ('draft','accepted','edited','discarded')),
  edited_answer text,                                 -- 상담원 최종본
  created_at    timestamptz not null default now(),
  created_by    uuid references agents(id)
);

-- FAQ (RAG 근거)
create table faqs (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  question    text not null, answer text not null,
  keywords    text[], embedding vector(1536),
  is_active   boolean not null default true,
  row_version int not null default 1,
  updated_at  timestamptz not null default now(), updated_by uuid references agents(id)
);

-- 태그 (N:M)
create table tags (id uuid primary key default gen_random_uuid(), name text unique not null, is_active boolean not null default true);
create table conversation_tags (
  conversation_id uuid references conversations(id) on delete restrict,
  tag_id uuid references tags(id) on delete restrict,
  primary key (conversation_id, tag_id)
);

-- 트리거 부착 (감사 + 삭제차단) — 예: clients
create trigger trg_audit_clients before insert or update on clients for each row execute function fn_audit();
create trigger trg_nodelete_clients before delete on clients for each row execute function fn_block_delete();
-- ↑ client_contacts, conversations, faqs 등 마스터 테이블에 동일 부착
-- messages/audit_logs 등 append-only 테이블은 삭제차단만 부착(감사는 INSERT 기록 선택)

-- 인덱스
create index idx_messages_conv on messages(conversation_id, sent_at);
create index idx_conv_lastmsg on conversations(last_message_at desc) where is_active;
create index idx_conv_category on conversations(category_id);
create index idx_conv_client on conversations(client_id);
create index idx_messages_content_trgm on messages using gin (content gin_trgm_ops);
create index idx_clients_name_trgm on clients using gin (name gin_trgm_ops);
-- 벡터 인덱스는 데이터 쌓인 뒤:
-- create index idx_messages_embedding on messages using ivfflat (embedding vector_cosine_ops) with (lists=100);
```

### 2-C. 배차 모듈 2차 (`0003_dispatch`)

```sql
-- 기사
create table drivers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null, phone text,
  vehicle_no  text, vehicle_type text,               -- 오토바이/다마스/라보/1톤
  memo        text,
  is_active   boolean not null default true,
  source_system text not null default 'nonstop', external_id text,   -- 인성 기사코드
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);

-- 오더(접수) — 상담 메시지/OCR에서 구조화 추출
create table orders (
  id            uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,  -- 어느 상담에서 나왔나
  client_id     uuid references clients(id) on delete set null,
  request_type  text,                                 -- 즉시 | 시간지정
  desired_time  timestamptz,
  item          text,                                 -- 물품(종이박스 14개 닭부분육)
  vehicle_type  text,
  note          text,                                 -- 특이사항
  via_order_fixed boolean default false,              -- 경유순서 지정 여부
  status        text not null default 'received'      -- 현재값(이력은 order_events)
                check (status in ('received','dispatching','dispatched','running','done','canceled')),
  is_active     boolean not null default true,
  row_version   int not null default 1,
  source_system text not null default 'nonstop', external_id text,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id),
  deactivated_at timestamptz, deactivated_by uuid references agents(id)
);

-- 경유/도착지(다중) — 순번 보존
create table order_stops (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete restrict,
  seq         int not null,
  stop_type   text not null check (stop_type in ('pickup','via','dropoff')),
  place_name  text, address text, phone text, qty text,
  is_active   boolean not null default true
);

-- 배차
create table dispatches (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete restrict,
  driver_id   uuid references drivers(id) on delete set null,
  vehicle_no  text, vehicle_type text,
  fare_supply numeric,                                -- 운임(공급가)
  status      text not null default 'assigned'
              check (status in ('assigned','reassigned','running','done','canceled')),
  assigned_at timestamptz, completed_at timestamptz,
  is_active   boolean not null default true,
  row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id)
);

-- ③ 오더/배차 상태 이벤트(append-only) — 재배차·취소 흐름 누적
create table order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete restrict,
  dispatch_id uuid references dispatches(id) on delete set null,
  event_type text not null,                           -- received/dispatched/reassigned/running/done/canceled
  payload jsonb, note text,
  occurred_at timestamptz not null default now(),
  created_by uuid references agents(id)
);
create index idx_order_events_order on order_events(order_id, occurred_at);
```

### 2-D. 운임 표준화 모듈 2차 (`0003_dispatch` 후반)

```sql
-- 표준 요금표(거리/차종 구간) — 거래처별 단가 표준화
create table fare_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null, client_id uuid references clients(id) on delete restrict,  -- null=공통표
  effective_from date not null, effective_to date,    -- 기간(과거표 누적 보존 ③)
  is_active boolean not null default true,
  source_system text not null default 'nonstop', external_id text,
  created_at timestamptz not null default now(), created_by uuid references agents(id)
);
create table fare_rules (
  id uuid primary key default gen_random_uuid(),
  fare_table_id uuid not null references fare_tables(id) on delete restrict,
  vehicle_type text, region_from text, region_to text,
  distance_min_km numeric, distance_max_km numeric,
  base_fare numeric, via_surcharge numeric, wait_surcharge numeric,
  is_active boolean not null default true
);
```
> 운임 변경은 새 `fare_tables`(effective_from)로 **버전 추가**, 구표는 비활성·기간 종료. 절대 덮어쓰지 않음.

### 2-E. 정산 모듈 3차 (`0004_settlement`)

```sql
-- 정산(월/거래처 단위 집계)
create table settlements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  period_ym text not null,                            -- '2026-06'
  total_supply numeric, total_vat numeric, total_amount numeric,
  status text not null default 'draft'
    check (status in ('draft','confirmed','invoiced','paid','partial','overdue')),
  is_active boolean not null default true, row_version int not null default 1,
  source_system text not null default 'nonstop', external_id text,   -- 인성 정산번호
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id)
);
create unique index uq_settlement_period on settlements(client_id, period_ym) where is_active;

-- 정산 명세(배차 1건 = 1라인)
create table settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete restrict,
  dispatch_id uuid references dispatches(id) on delete set null,
  description text, supply numeric, vat numeric, amount numeric,
  is_active boolean not null default true
);

-- 세금계산서(발행/재발행 이력 누적 ③)
create table tax_invoices (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid references settlements(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  invoice_no text, nts_confirm_no text,               -- 국세청 승인번호
  issue_date date, supply numeric, vat numeric, total numeric,
  status text not null default 'issued'
    check (status in ('issued','reissued','canceled','sent','accepted')),
  external_id text,                                    -- 인성/홈택스 연동키
  is_active boolean not null default true, row_version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references agents(id),
  updated_at timestamptz not null default now(), updated_by uuid references agents(id)
);
```

### 2-F. 인성 연동 모듈 (`0005_integration`)

```sql
-- 외부 원본 적재(검증 전 격리) — 인성에서 들어온 그대로
create table integration_staging (
  id bigserial primary key,
  source_system text not null default 'insung',
  entity text not null,                               -- 'client' | 'driver' | 'fare' | 'settlement'
  external_id text not null,
  payload jsonb not null,                             -- 원본 레코드
  hash text,                                          -- 변경 감지(같으면 skip)
  batch_id uuid not null,
  processed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','applied','skipped','conflict','failed')),
  error text,
  received_at timestamptz not null default now()
);
create index idx_staging_lookup on integration_staging(entity, external_id, batch_id);

-- 동기화 배치 로그
create table integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'insung',
  direction text not null default 'inbound',          -- inbound(읽기) | outbound(밀어넣기)
  entity text not null, batch_id uuid not null,
  total int, applied int, skipped int, conflicts int, failed int,
  started_at timestamptz not null default now(), finished_at timestamptz,
  triggered_by uuid references agents(id), note text
);

-- (선택) 매핑 보조: 우리 id ↔ 인성 id 다대다/별칭 관리가 필요할 때
create table external_refs (
  id bigserial primary key,
  local_table text not null, local_id uuid not null,
  source_system text not null, external_id text not null,
  created_at timestamptz not null default now(),
  unique (source_system, local_table, external_id)
);
```

> **upsert 규칙**: staging → master 는 `uq_*_external (source_system, external_id)` 로 멱등 upsert. 동일 `hash`면 skip(③ 불필요 이력 방지), 값이 다르면 UPDATE(→ 트리거가 자동으로 audit_logs에 before/after 기록 ⑤).

---

## 3. 핵심 동작 패턴 (원칙 강제)

### ④ "삭제" = 비활성화 함수
```sql
create or replace function fn_deactivate(p_table regclass, p_id uuid, p_by uuid)
returns void language plpgsql as $$
begin
  execute format(
    'update %s set is_active=false, deactivated_at=now(), deactivated_by=$2, updated_by=$2 where id=$1 and is_active',
    p_table) using p_id, p_by;
end $$;
-- 앱은 DELETE 대신 항상 이 함수 호출. fn_block_delete 트리거가 우회를 차단.
```

### ② DB 권한으로 물리삭제 원천 차단
```sql
-- 앱 전용 롤에서 DELETE 권한 회수(트리거와 이중 안전장치)
revoke delete on all tables in schema public from app_role;
alter default privileges in schema public revoke delete on tables from app_role;
```

### 조회는 활성 행만 (뷰 표준화)
```sql
create view v_active_clients as select * from clients where is_active;
create view v_active_conversations as select * from conversations where is_active;
-- 앱 기본 조회는 v_active_*; 관리자 '비활성 포함' 화면만 원본 테이블 조회.
```

### ⑥ 상담 1건 처리 흐름(1차 핵심)
```
카카오 웹훅 → messages insert(멱등) → 200 ack
  └ 비동기 후속:
     1) 이미지 있으면 → message_ocr(pending) → OCR 엔진 → raw_text/extracted 저장
     2) 거래처 자동분류: kakao_user_key/문맥 → clients 매칭(없으면 미매칭 보류)
     3) 유형 분류(Claude structured output) → conversations.category_id
     4) 임베딩(messages/OCR) 저장
     5) 논사원 AI 초안: FAQ + 유사 과거상담 RAG → ai_responses(draft)
  └ 상담원: 초안 확인/수정 → 발송 → messages(agent) + ai_responses.status 갱신(③ 누적)
```

---

## 4. 단계별 적용 순서 (⑥ 상담 최우선)

| 단계 | 마이그레이션 | 결과물 |
|------|--------------|--------|
| **1차** | `0001_core` + `0002_consult` | 카톡 수집·OCR·거래처/담당자/상담이력·논사원 AI 초안. **이것만으로 운영 시작** |
| **연동(1차 병행)** | `0005_integration` | 인성 거래처/담당자 import(읽기) → 자동 매칭 품질↑ |
| **2차** | `0003_dispatch` | 오더 구조화·배차·기사·운임표 표준화 |
| **3차** | `0004_settlement` | 정산 집계·세금계산서·회계 연동 |

> 각 단계는 **앞 단계 테이블을 변경하지 않고 추가만** 한다(누적·무중단). 같은 DB·인증·코드베이스(모듈형 모놀리스) 위에 증설.

---

## 5. 결정 필요 항목 (설계 확정 전 확인)

- [ ] **인성 연동 형태**: DB 직접 read 가능? / CSV·Excel export? / API 존재? → 어댑터 구현 방식 결정
- [ ] **OCR 엔진**: 한글 손글씨·캡처 정확도 vs 비용 → CLOVA(국내 한글 강점) 우선 검토
- [ ] **AI 모델**: 기존 docs는 OpenAI 전제. 본 프로젝트는 Claude(분류=Haiku, 초안=Sonnet) 권장 — 임베딩 차원 확정 필요(1536 유지 시 임베딩만 별도 공급자 가능)
- [ ] **카카오 상담톡 계약/스펙**: 웹훅 페이로드·발송 API (docs/04 체크리스트)
- [ ] **인증/RLS**: Supabase Auth 사용 여부(agents.auth_uid 연계) vs 자체 인증

> 관련: [01 아키텍처](01-architecture.md) · [02 DB 스키마](02-database-schema.md) · [08 도메인 모델](08-domain-model.md) · [06 로드맵](06-roadmap.md)
