# 10. 1차 개발 범위 — 논사원 AI (상담 CRM → OCR → AI 초안)

> 확정 방침(2026-06-05): **완전 자동화하지 않는다.** 사람이 운영하는 상담 CRM을 먼저 세우고, OCR로 입력을 돕고, AI는 "초안"만 만든다. **자동 발송 없음 / 직원 승인 후 발송.** 인성 연동은 2차로 미루되 `external_refs` 자리만 준비한다.
>
> 상위 설계는 [09 ERP DB·아키텍처](09-erp-db-architecture.md). 본 문서는 그중 **1차에서 실제로 만들 부분만** 잘라낸 실행 명세다.

---

## 0. 현재 상태 → 1차 목표 (격차)

| 항목 | 현재 (MVP 프로토타입) | 1차 목표 |
|------|----------------------|----------|
| 저장소 | `.data/consultations.json` 파일 | **PostgreSQL** (감사·이력·비활성화 트리거 필요) |
| 거래처/담당자 | 자유 텍스트(`client_name`/`manager_name`) | **마스터 테이블 + 선택/등록**(매칭·누적) |
| 상담유형 | 자유 텍스트 | `categories` 선택([07] 트리 seed) |
| 이미지 | `public/uploaded/`에 저장, 경로만 보관 | **raw 이미지 행으로 저장** + OCR 연결 |
| OCR | 없음 | `consultation_ocr` (raw_text·extracted·confidence·수동입력) |
| AI 답변 | 패널 목업 | `ai_responses` 누적(초안→수정→승인) |
| 검수 | 없음 | **직원 검수 필드**(상태·검수자·검수시각) |
| 삭제 | 물리 삭제 + 이미지 unlink ⚠️ | **비활성화(is_active)로 전환** |

> **모델 정합성 메모**: 1차는 카카오 실시간 스레드(`conversations`/`messages`)를 아직 붙이지 않는다. 중심 엔티티는 **`consultations`(상담 1건 = 카드)**. [09]의 `message_ocr`는 1차에서 **`consultation_ocr`(이미지 기준)** 로 대응한다. 실시간 카카오 연동이 들어오는 단계에서 `conversations/messages`를 추가하고 consultation에 링크한다.

---

## 1. 필요한 테이블 (1차 한정)

마이그레이션: `0001_core` + `0002_phase1`. 모든 테이블은 [09]의 공통 컬럼 표준(`is_active/row_version/source_system/external_id/created_*·updated_*·deactivated_*`)과 감사·삭제차단 트리거를 따른다.

### (1) 마스터

```sql
-- 직원(접수팀/배차팀/관리자) — 등록자·검수자·승인자
agents(
  id uuid pk, name, team(reception|dispatch|admin), phone,
  is_active, created_at, deactivated_at
)

-- 거래처 — 선택/등록, 인성 연동 자리만 준비
clients(
  id uuid pk, name not null, business_no, phone, memo,
  source_system default 'nonstop', external_id,           -- ← 2차 인성 매핑 자리
  is_active, row_version, created_*, updated_*, deactivated_*
)
-- 멱등 매핑 키(2차 대비): unique(source_system, external_id) where external_id not null

-- 거래처 담당자 — 선택/등록
client_contacts(
  id uuid pk, client_id fk→clients(restrict), name not null,
  position, phone, kakao_user_key, is_primary,
  source_system, external_id,                              -- ← 2차 자리
  is_active, row_version, created_*, updated_*, deactivated_*
)

-- 상담유형 — [07] 트리 seed
categories(
  id uuid pk, parent_id fk→categories(restrict), code unique,
  name not null, description, sort_order, is_active
)
```

### (2) 상담 CRM 핵심

```sql
-- 상담 1건(카드) — 1차의 중심
consultations(
  id uuid pk,
  client_id    fk→clients(set null),          -- 거래처(미매칭 허용)
  contact_id   fk→client_contacts(set null),  -- 담당자
  category_id  fk→categories(set null),        -- 상담유형
  content_original text,                        -- 상담내용 원문(가공 금지, 줄바꿈 보존)
  channel text default 'manual',                -- manual|kakao|phone (전화/카톡 출처)

  -- 처리상태(현재값)
  process_status text not null default 'received'
    check (process_status in ('received','in_progress','answered','closed','hold')),

  -- 직원 검수 필드 ★
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed','reviewing','approved','rejected')),
  reviewed_by  fk→agents(set null),
  reviewed_at  timestamptz,
  review_note  text,

  source_system default 'nonstop', external_id,            -- ← 2차 자리
  is_active, row_version,
  created_by fk→agents, created_at, updated_by fk→agents, updated_at,
  deactivated_by fk→agents, deactivated_at
)
-- 인덱스: (process_status), (review_status), (client_id), (created_at desc) where is_active
--         content_original gin_trgm (한글 부분검색)

-- 상담 이미지(raw) — OCR 전 원본 보존 ★
consultation_images(
  id uuid pk, consultation_id fk→consultations(restrict),
  storage_path text not null,                   -- 원본 이미지 경로
  original_name text, mime_type, byte_size, seq int,
  is_active, created_by, created_at
)
```

### (3) OCR

```sql
-- OCR 결과 — 이미지 1장 = OCR 1행 ([09] message_ocr 대응)
consultation_ocr(
  id uuid pk,
  image_id fk→consultation_images(restrict),
  consultation_id fk→consultations(restrict),   -- 조회 편의
  engine text,                                   -- clova|gvision|tesseract|manual
  raw_text text,                                 -- OCR 전체 텍스트 ★
  extracted_json jsonb,                          -- 구조화 추출(출발/도착/물품/차종 등) ★
  confidence_score numeric,                      -- 0~1 평균 신뢰도 ★
  status text not null default 'pending'
    check (status in ('pending','done','failed','manual','review')),
  is_manual boolean not null default false,      -- OCR 실패 시 수동입력 여부 ★
  error text,
  created_by fk→agents, created_at, updated_at
)
-- OCR 실패(status='failed') → 직원이 raw_text 직접 입력 → status='manual', is_manual=true
```

### (4) 논사원 AI

```sql
-- AI 답변 초안 이력 — 누적(append), 자동발송 금지 ★
ai_responses(
  id uuid pk,
  consultation_id fk→consultations(restrict),
  model text,                                    -- claude-sonnet-4-6 등
  prompt_context jsonb,                          -- 사용한 FAQ/원문/OCR 스냅샷(재현용)
  generated_answer text,                         -- AI 초안(원본 보존)
  edited_answer text,                            -- 직원 수정본(최종 후보)
  used_faq_ids uuid[], confidence numeric,
  status text not null default 'draft'
    check (status in ('draft','edited','approved','sent','discarded')),
  approved_by fk→agents(set null), approved_at timestamptz,   -- 승인 게이트 ★
  sent_at timestamptz,                           -- 실제 발송 시각(수동)
  created_by fk→agents, created_at
)
-- 상태 전이: draft → (edited) → approved → sent | discarded
-- approved 이전에는 발송 버튼 비활성. 자동 발송 코드 경로 없음.

-- FAQ(RAG 근거) — 1차는 등록·키워드 검색만으로 시작, 임베딩은 데이터 쌓인 뒤
faqs(
  id uuid pk, category_id fk→categories(set null),
  question not null, answer not null, keywords text[],
  is_active, row_version, updated_*, created_*
)
```

### (5) 공통 인프라 ([09]에서 가져옴)

```sql
audit_logs(...)             -- 모든 UPDATE before/after(jsonb) 자동 기록 ⑤
fn_audit() 트리거            -- 각 마스터/상담 테이블에 부착
fn_block_delete() 트리거     -- 물리삭제 차단 ②
fn_deactivate(table,id,by)  -- "삭제" = 비활성화 ④
external_refs(...)          -- 2차 인성 매핑용. 1차엔 생성만, 미사용 ①
```

> **1차 테이블 총 12개**: agents, clients, client_contacts, categories, consultations, consultation_images, consultation_ocr, ai_responses, faqs, audit_logs, external_refs (+ tags 선택).

---

## 2. 화면 (1차)

| # | 라우트 | 화면 | 핵심 기능 |
|---|--------|------|-----------|
| 1 | `/dashboard` | 대시보드 | 처리상태별·검수상태별 건수, 오늘 접수 |
| 2 | `/consultations` | 상담 목록 | 필터(처리상태·검수상태·거래처·유형), 검수/상태 뱃지, 검색(원문 부분일치) |
| 3 | `/consultations/new` | 상담 등록 | ↓ 등록 폼(아래 상세) |
| 4 | `/consultations/[id]` | 상담 상세/수정 | 원문·이미지·OCR·AI초안·검수, 상태 전이 |
| 5 | `/clients` | 거래처 관리 | 목록/등록/수정/비활성화 |
| 6 | `/clients/[id]` | 거래처 상세 | 담당자 관리(등록/수정/비활성화) + 상담 이력 |
| 7 | `/categories` | 상담유형 관리 | seed 트리 조회/활성토글 |
| 8 | `/faqs` | FAQ 관리 | CRUD(3단계 RAG 근거 준비) |

### 상담 등록/상세 폼 구성 (화면 3·4 — 1차의 핵심 UI)

```
┌─ 상담 등록/상세 ────────────────────────────────┐
│ [거래처]  ▼선택 ───────  (+ 신규 등록 inline)    │  ← clients
│ [담당자]  ▼선택(거래처 종속) (+ 신규 등록)        │  ← client_contacts
│ [상담유형] ▼선택(대/소분류)                       │  ← categories
│ [출처]    manual|kakao|phone                     │
│ ──────────────────────────────────────────────  │
│ [이미지 업로드] (다중) → 썸네일                   │  ← consultation_images (raw 보존)
│   └ 각 이미지: [OCR 실행] → raw_text 미리보기     │  ← consultation_ocr
│       confidence 표시 / 실패 시 [수동입력]        │
│ [상담내용 원문]  (textarea, 가공 금지)            │  ← content_original
│ ──────────────────────────────────────────────  │
│ [논사원 AI 초안 생성]                             │  ← ai_responses
│   └ 생성된 초안(읽기) → [수정] textarea           │
│   └ [승인](approved) → [발송 표시](sent, 수동)    │  ← 자동발송 없음
│ ──────────────────────────────────────────────  │
│ [처리상태] received|in_progress|answered|closed   │
│ [검수] 검수자·검수상태(approved/rejected)·메모    │  ← 직원 검수 필드
│ [저장]   /  [비활성화](삭제 대신)                 │
└──────────────────────────────────────────────────┘
```

> 거래처/담당자는 **드롭다운 선택**이 기본, 없으면 **그 자리에서 신규 등록**(inline)해 즉시 선택. 자유 텍스트 입력 방식(현재 MVP)은 폐기.

---

## 3. 개발 순서 (구체)

> 각 단계 끝에 "실제로 쓸 수 있는 상태". 앞 단계 산출물을 변경하지 않고 쌓는다.

### P0 — Postgres 전환 & 코어 (기반)
1. PostgreSQL 연결 (Supabase 또는 로컬 PG) + `.env` 정리
2. `pgcrypto`/`pg_trgm` 확장, `0001_core.sql`: `agents`, `audit_logs`, `fn_audit`, `fn_block_delete`, `fn_deactivate`
3. DB 접근 계층 교체 — `src/lib/store.ts`(JSON) → `src/lib/db/*`(PG 쿼리). **화면이 의존하는 `src/lib/data/index.ts` 인터페이스는 유지**(구현만 교체)
4. 기존 `.data/consultations.json` → `consultations` 테이블 **1회 이관 스크립트**(데이터 삭제 금지: 그대로 import)
5. `deleteConsultation` 제거 → `fn_deactivate` 호출로 교체 ⚠️

### P1 — 마스터(거래처·담당자·유형)
6. `0002` 일부: `clients`, `client_contacts`, `categories`(+ [07] seed), `external_refs`
7. 화면 `/clients`, `/clients/[id]`(담당자), `/categories`
8. 상담 폼의 거래처/담당자/유형을 **선택+inline 등록**으로 교체

### P2 — 상담 CRM 본체
9. `0002`: `consultations`(검수·상태 필드 포함), `consultation_images`
10. 등록/상세 화면(3·4): 이미지 업로드 → raw 행 저장, 원문 저장, 처리상태·검수 필드
11. 목록 `/consultations` 필터·검색, 대시보드 집계

### P3 — OCR
12. `0002`: `consultation_ocr`
13. OCR 어댑터 `lib/ocr/`(엔진 교체 가능) — 이미지 → raw_text·confidence
14. 상세 화면에 OCR 실행/결과/`수동입력 fallback`(status=failed→manual)
15. (선택) `extracted_json` 구조화 추출 — 1차는 raw_text 우선, 추출은 베스트에포트

### P4 — 논사원 AI 초안
16. `0002`: `ai_responses`, `faqs`(+ 초기 FAQ seed)
17. AI 어댑터 `lib/ai/`(Claude) — 원문(+OCR raw_text) + FAQ → 초안 생성
18. 상세 화면 AI 패널: 생성→수정(edited_answer)→**승인(approved)**→발송표시(sent)
19. `ai_responses` 누적 저장, 자동발송 경로 부재 확인(승인 전 발송 비활성)

### 2차로 미룸 (자리만 준비)
- 인성 연동(`integration_*` 모듈) — `external_refs`/`source_system`/`external_id` 컬럼만 1차에 존재
- 카카오 실시간 웹훅(`conversations`/`messages`), 배차/운임/정산

---

## 4. 1차 완료 기준 (Definition of Done)

- [ ] 직원이 카톡/전화 상담을 **이미지+원문**으로 등록(거래처·담당자·유형 선택)
- [ ] 이미지 raw 보존 + OCR raw_text 확인, **실패 시 수동입력**
- [ ] **논사원 AI 초안** 생성 → 직원 수정 → **승인 후** 최종 답변 저장(자동발송 없음)
- [ ] 모든 AI 답변이 `ai_responses`에 **누적**
- [ ] **삭제 버튼이 없음**(비활성화만), 모든 변경이 `audit_logs`에 기록
- [ ] `external_refs`/`source_system` 자리 존재(인성 2차 연동 무중단 대비)

---

## 5. 시작 전 결정 1가지

- **DB 호스팅**: Supabase Postgres(권장 — Auth/Storage/RLS 일체) vs 로컬 PostgreSQL(외부 의존 없음, 추후 이전).
  → 어느 쪽이든 스키마/마이그레이션은 동일. P0에서 택1.

> 관련: [09 ERP DB·아키텍처](09-erp-db-architecture.md) · [07 상담유형](07-category-taxonomy.md) · [05 AI 파이프라인](05-ai-pipeline.md)
