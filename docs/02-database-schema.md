# 02. DB 스키마

Supabase(Postgres) 기준. 의미 검색을 위해 `pgvector`, 한글 키워드 검색을 위해 `pg_trgm`을 사용한다.

## ER 개요

```
clients(거래처) 1 ──< customers(고객) 1 ──< conversations(상담) 1 ──< messages(메시지)
                                                   │
categories(상담유형) ──────────────────────────────┘
                                                   │
conversations 1 ──< ai_responses(AI 답변이력)
faqs(FAQ) >── categories
agents(상담원) ──< conversations (담당)
tags ──< conversation_tags >── conversations
```

## 핵심 테이블

### clients — 거래처
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| name | text | 거래처명 |
| business_no | text | 사업자번호 |
| phone | text | 대표 연락처 |
| memo | text | |
| created_at | timestamptz | |

### customers — 상담 고객(카카오 사용자)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| kakao_user_key | text UNIQUE | 상담톡에서 내려주는 사용자 식별키 |
| name | text | |
| phone | text | |
| client_id | uuid FK → clients | nullable(거래처 미매칭 가능) |
| created_at | timestamptz | |

### categories — 상담유형 (계층형)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| parent_id | uuid FK → categories | 대/소분류 |
| name | text | |
| description | text | 분류 프롬프트에 활용 |
| sort_order | int | |
| is_active | bool | |

### conversations — 상담 세션
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| customer_id | uuid FK → customers | |
| client_id | uuid FK → clients | 조회 편의를 위한 비정규화(nullable) |
| category_id | uuid FK → categories | 자동분류 결과 |
| status | text | open / pending / closed |
| assigned_agent_id | uuid FK → agents | 담당 상담원 |
| channel | text | 'kakao' (확장 대비) |
| last_message_at | timestamptz | 목록 정렬용 |
| created_at | timestamptz | |

### messages — 메시지
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| conversation_id | uuid FK → conversations | |
| sender_type | text | customer / agent / ai / system |
| sender_agent_id | uuid FK → agents | agent 발송 시 |
| content | text | 본문 |
| attachments | jsonb | 이미지/파일 메타 |
| raw_payload | jsonb | 카카오 원본(감사·디버깅) |
| embedding | vector(1536) | 검색·RAG용(text-embedding-3-small) |
| sent_at | timestamptz | 카카오 기준 시각 |
| created_at | timestamptz | 저장 시각 |

### categories 자동분류와 별개로, AI 답변은 별도 보관

### ai_responses — AI 답변 생성 이력
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| conversation_id | uuid FK | |
| trigger_message_id | uuid FK → messages | 어떤 고객 메시지에 대한 답변인지 |
| model | text | 예: gpt-4o-mini |
| generated_answer | text | AI 초안 |
| used_faq_ids | uuid[] | RAG에 사용된 FAQ |
| confidence | numeric | 0~1(선택) |
| status | text | draft / accepted / edited / discarded |
| edited_answer | text | 상담원이 수정한 최종본 |
| created_at | timestamptz | |

### faqs — FAQ
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| category_id | uuid FK → categories | |
| question | text | |
| answer | text | |
| keywords | text[] | 보조 검색 |
| embedding | vector(1536) | 의미 검색 |
| is_active | bool | |
| updated_at | timestamptz | |

### agents — 상담원 (Supabase auth.users 연계)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK = auth.users.id | |
| name | text | |
| role | text | admin / agent |
| is_active | bool | |

### tags / conversation_tags — 태그(N:M)
`tags(id, name)` · `conversation_tags(conversation_id, tag_id)`

## 생성 SQL (마이그레이션 초안)

```sql
-- supabase/migrations/0001_init.sql
create extension if not exists "uuid-ossp";
create extension if not exists vector;
create extension if not exists pg_trgm;

create table clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  business_no text,
  phone text,
  memo text,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default uuid_generate_v4(),
  kakao_user_key text unique,
  name text,
  phone text,
  client_id uuid references clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  sort_order int default 0,
  is_active boolean not null default true
);

create table agents (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'agent',
  is_active boolean not null default true
);

create table conversations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  status text not null default 'open',
  assigned_agent_id uuid references agents(id) on delete set null,
  channel text not null default 'kakao',
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','agent','ai','system')),
  sender_agent_id uuid references agents(id) on delete set null,
  content text,
  attachments jsonb,
  raw_payload jsonb,
  embedding vector(1536),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table ai_responses (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  trigger_message_id uuid references messages(id) on delete set null,
  model text,
  generated_answer text,
  used_faq_ids uuid[],
  confidence numeric,
  status text not null default 'draft' check (status in ('draft','accepted','edited','discarded')),
  edited_answer text,
  created_at timestamptz not null default now()
);

create table faqs (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete set null,
  question text not null,
  answer text not null,
  keywords text[],
  embedding vector(1536),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table tags (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null
);
create table conversation_tags (
  conversation_id uuid references conversations(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (conversation_id, tag_id)
);

-- 인덱스
create index idx_messages_conversation on messages(conversation_id, sent_at);
create index idx_conversations_last_msg on conversations(last_message_at desc);
create index idx_conversations_category on conversations(category_id);
create index idx_conversations_client on conversations(client_id);
create index idx_faqs_keywords on faqs using gin (keywords);
create index idx_messages_content_trgm on messages using gin (content gin_trgm_ops);

-- 벡터 인덱스(데이터 쌓인 뒤 생성 권장)
create index idx_messages_embedding on messages using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index idx_faqs_embedding on faqs using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

## 의미 검색 함수 (RAG/검색용)

```sql
-- FAQ 의미 검색
create or replace function match_faqs(query_embedding vector(1536), match_count int default 5)
returns table (id uuid, question text, answer text, similarity float)
language sql stable as $$
  select f.id, f.question, f.answer,
         1 - (f.embedding <=> query_embedding) as similarity
  from faqs f
  where f.is_active and f.embedding is not null
  order by f.embedding <=> query_embedding
  limit match_count;
$$;
```

## RLS(행 수준 보안) 방침

- `agents.role = 'admin'`: 전체 접근.
- 일반 상담원: 모든 상담 열람 가능(콜센터 특성). 단, 쓰기는 본인 발송 메시지로 제한 가능.
- 웹훅 저장은 **service_role 키**로 RLS 우회(서버 전용).
- MVP에서는 RLS를 단순하게 시작하고, 운영 정책 확정 후 정교화.

## 한글 검색 메모

- 키워드 검색은 `pg_trgm`(부분일치)로 시작 → 운영 데이터로 한글 형태소 검색 필요성 판단.
- 의미 검색은 pgvector(임베딩)로 처리하므로, 두 방식을 결합(하이브리드)한다. 상세는 [05. AI 파이프라인](05-ai-pipeline.md).

> 다음: [03. 화면 구조](03-screens.md)
