# 01. 아키텍처

## 설계 원칙

1. **모듈형 모놀리스** — 상담센터를 첫 모듈로 두고, 접수/배차/기사/정산을 같은 코드베이스·DB·인증 위에 도메인 모듈로 추가한다. 초기에 마이크로서비스로 쪼개지 않는다.
2. **Supabase를 백엔드 코어로** — Postgres(데이터) + Auth(상담원 로그인) + Storage(첨부) + RLS(권한). pgvector로 의미 검색.
3. **AI는 "초안 생성기"** — AI가 자동 발송하지 않는다. 항상 상담원 검토 후 발송(Human-in-the-loop). 답변 채택/수정 결과를 학습 데이터로 축적.
4. **수집과 처리의 분리** — 카카오 웹훅은 최대한 빨리 저장만 하고(ack), 분류·AI 답변은 후속(비동기) 작업으로 처리.

## 전체 구성도

```
[카카오 상담톡]                         [상담원 브라우저]
      │ 웹훅(수신)                            │
      ▼                                       ▼
┌──────────────────────────────────────────────────────┐
│                  Next.js (App Router)                  │
│                                                        │
│  app/api/kakao/webhook   ← 메시지 수신, 빠른 저장      │
│  app/api/ai/classify     ← 유형 분류                   │
│  app/api/ai/draft        ← AI 답변 초안                │
│  app/api/kakao/send      ← 상담원 발송                 │
│                                                        │
│  app/(dashboard)/...     ← 상담 콘솔 UI (React Server  │
│                              Components + Client)       │
└───────────┬───────────────────────────┬───────────────┘
            │                            │
            ▼                            ▼
   ┌─────────────────┐          ┌──────────────────┐
   │   Supabase      │          │   OpenAI API     │
   │  - Postgres     │          │  - 분류(structured)│
   │  - pgvector     │          │  - 임베딩         │
   │  - Auth / RLS   │          │  - 답변 생성      │
   │  - Storage      │          └──────────────────┘
   └─────────────────┘
```

## 데이터 흐름 (상담 1건)

1. 고객이 카카오채널에 메시지 → **상담톡 웹훅** → `POST /api/kakao/webhook`
2. 웹훅 핸들러: 고객/대화 매칭(없으면 생성) → `messages`에 저장 → 즉시 200 응답
3. 후속 작업(서버 액션/큐):
   - **분류**: 메시지 → `/api/ai/classify` → `conversations.category_id` 갱신
   - **임베딩**: 메시지 임베딩 저장(검색·RAG용)
   - **AI 초안**: FAQ + 유사 과거상담 검색(RAG) → `ai_responses`에 초안 저장
4. 상담원이 콘솔에서 대화 열람 → AI 초안 확인/수정 → **발송** → `/api/kakao/send` → 상담톡 API
5. 발송 결과를 `messages`(sender=agent)와 `ai_responses.accepted/edited_answer`에 기록

## 비동기 처리 전략 (단계별)

- **MVP**: 웹훅 저장 후 Next.js 서버 액션에서 순차 처리(분류→임베딩→초안). 트래픽 적으면 충분.
- **확장**: Supabase `pg_cron` + `pgmq` 또는 외부 큐(예: Upstash QStash)로 후속 작업 비동기화. 웹훅은 저장+enqueue만.

## 기술 결정 요약

| 항목 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js App Router | UI + API Route + 서버 액션 일체화 |
| DB | Postgres (Supabase) | 관계형 + pgvector + RLS |
| 인증 | Supabase Auth | 상담원 계정·세션 관리, RLS 연동 |
| 의미 검색 | pgvector | FAQ/상담이력 RAG, 별도 벡터DB 불필요 |
| AI | OpenAI API | 분류(structured output), 임베딩, 답변 생성 |
| 호스팅 | Vercel(앱) + Supabase(DB) | 웹훅 엔드포인트 상시 가동 |

## 폴더 구조(제안)

```
NONSTOP-System/
├─ app/
│  ├─ (auth)/login/
│  ├─ (dashboard)/
│  │  ├─ conversations/         # 상담 목록·상세
│  │  ├─ faqs/                  # FAQ 관리
│  │  ├─ categories/            # 상담유형 관리
│  │  ├─ clients/               # 거래처 관리
│  │  ├─ search/                # 상담이력 검색
│  │  └─ layout.tsx
│  └─ api/
│     ├─ kakao/webhook/route.ts
│     ├─ kakao/send/route.ts
│     ├─ ai/classify/route.ts
│     └─ ai/draft/route.ts
├─ lib/
│  ├─ supabase/                 # 서버/클라이언트 인스턴스
│  ├─ kakao/                    # 상담톡 API 래퍼
│  ├─ ai/                       # OpenAI 래퍼(분류·임베딩·RAG)
│  └─ db/                       # 쿼리 헬퍼, 타입
├─ supabase/
│  └─ migrations/               # SQL 마이그레이션
├─ components/                  # 공용 UI
└─ docs/                        # 본 설계 문서
```

## 환경 변수(.env)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # 서버 전용(웹훅에서 RLS 우회 저장)
OPENAI_API_KEY=
KAKAO_REST_API_KEY=               # 상담톡/비즈니스
KAKAO_WEBHOOK_SECRET=             # 웹훅 검증용
```

> 다음: [02. DB 스키마](02-database-schema.md)
