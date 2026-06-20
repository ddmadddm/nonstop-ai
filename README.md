# NONSTOP-AI · 논사원 AI

논스톱서비스(**퀵/화물 배차 중개**)의 상담 데이터를 학습·활용하는 사내 AI 상담비서 **'논사원 AI'**.
카카오 상담톡·전화 상담을 한곳에 모아 **상담 CRM → 자료 변환(OCR/STT) → 구조화 추출 → AI 답변 초안**까지 이어지는 파이프라인을 제공한다.
반응형 웹 + PWA. 직원 로그인(Supabase Auth) 기반의 역할별 접근 제어를 갖춘다.

> **자동 발송 없음.** AI는 "초안"만 만들고, 직원이 검수·승인한 뒤에만 사용한다.
> 원본 데이터는 **물리 삭제·수정 금지**(DB 트리거로 강제), 삭제는 비활성화로 처리한다.

## 기술 스택

| 영역 | 사용 |
|------|------|
| 프레임워크 | **Next.js 16**(커스텀 빌드 — 미들웨어가 `src/proxy.ts`로 대체됨) · React · App Router |
| DB | **PostgreSQL**(`postgres.js` 드라이버 + `DATABASE_URL`) — 표준 PG 기준, 호스팅은 Supabase Postgres |
| 인증/스토리지 | **Supabase**(Auth 로그인 / Storage) |
| AI | **Anthropic Claude**(구조화 추출·답변 초안, 강제 tool use) · **OpenAI Whisper**(음성 STT) |
| 파일 | `exceljs`(xlsx 파싱) · Claude 비전 OCR(이미지/PDF) |

> Next.js가 커스터마이즈되어 있어 표준 동작과 다를 수 있습니다. 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 확인하세요(AGENTS.md 참고).

## 설치 & 실행

```bash
# 1) 의존성
npm install

# 2) 환경변수 — .env.example 을 복사해 .env 생성 후 값 채우기
cp .env.example .env
#   DATABASE_URL (Supabase Postgres 연결 문자열) — 필수
#   NEXT_PUBLIC_SUPABASE_URL / ..._ANON_KEY  — 로그인 필수
#   SUPABASE_SERVICE_ROLE_KEY                — 직원 계정 생성(서버 전용)
#   ANTHROPIC_API_KEY                        — 구조화 추출/OCR
#   OPENAI_API_KEY                           — 음성 STT(없으면 오디오는 원본만 보관)

# 3) 마이그레이션 + 기존 JSON 이관(한 번에)
npm run db:setup       # = db:migrate (db/migrations/*.sql 순서 적용) + db:import

# 4) 개발 서버
npm run dev            # http://localhost:3000  → 로그인 후 /dashboard
```

> `.env` 와 실제 키·비밀번호는 **절대 커밋하지 않습니다**(`.gitignore`로 제외). 템플릿은 `.env.example` 참고.
> `db:migrate` 는 적용된 마이그레이션을 건너뛰고, `db:import` 는 멱등(중복 없음)입니다.

## 화면 (좌측 메뉴)

| 경로 | 메뉴 | 설명 |
|------|------|------|
| `/dashboard` | 대시보드 | 단계 현황·상담 통계·유형 분포·최근 상담 |
| `/assistant` | 논사원 답변 | 질문 입력 → 키워드(pg_trgm) RAG → **답변문 + 8개 항목 초안**(`assistant_drafts`) |
| `/conversations` · `/conversations/[id]` | 상담관리 | 상담 목록 / 상세(스레드·오더·AI 초안) |
| `/chatlogs` · `/chatlogs/[id]` | 상담자료 업로드 | 카카오 상담톡 원본·상담자료 업로드 → 변환·추출 파이프라인 |
| `/faqs` | FAQ 관리 | RAG 근거 FAQ |
| `/clients` · `/clients/[id]` | 거래처 | 거래처 / 거래처별 상담 이력 |
| `/search` | 상담검색 | 상담 이력 검색 |
| `/staff` | 직원관리 *(관리자 전용)* | 직원 등록·역할 관리, 로그인 계정 생성 |
| `/settings` | 설정 | 연동 상태·팀 |
| `/login` · `/auth` | — | Supabase Auth 로그인 / 콜백 · 비밀번호 재설정 |

## 데이터 파이프라인

**① 카카오 상담톡 원본**(`.xlsx` / `.csv` UTF-8 / `.txt` DATE·USER·MESSAGE 표) 업로드 → 3계층 적재:

```
raw_messages         원본 1행 = 1행 (수정·삭제 금지: 트리거 강제)
   └→ parsed_messages   sender_type 분류(논스톱서비스=staff) + 대화 그룹화 + 시각 파싱
        └→ ai_training_data  (고객 발화) → (직원 응답) Q&A 쌍 — 학습용
```

**② 상담자료**(이미지·PDF·음성) 업로드 → **변환**(이미지/PDF: Claude 비전 OCR, 음성: Whisper STT) → **구조화 추출**(Claude 강제 tool use로 8개 항목 추출) → 상담 데이터로 누적.

- 중복 차단: 파일 해시 + 행 해시 유니크 / 재업로드 시 덮어쓰기 지원
- 원본 파일 보관: 로컬 `.data/`·`public/uploaded/`(추후 Supabase Storage 이전)
- 한글 인코딩 보존(UTF-8 디코드 + BOM 제거)

## 구조

```
src/
├─ proxy.ts                 # ★ 미들웨어 대체(Next 16 커스텀) — 인증 가드
├─ app/
│  ├─ layout.tsx            # 루트(한국어·PWA)
│  ├─ page.tsx              # → /dashboard
│  ├─ login/ · auth/        # Supabase Auth 로그인·콜백·비밀번호 재설정
│  └─ (app)/                # 사이드바 셸 적용 화면 그룹
│     ├─ dashboard · assistant · conversations · chatlogs
│     ├─ faqs · clients · search · settings
│     └─ staff/             # 직원관리(관리자 전용)
├─ components/              # AppShell 등
└─ lib/
   ├─ data/index.ts         # 화면용 데이터 접근 인터페이스
   ├─ db/                   # PG 쿼리 계층 (agents·assistant·chatlogs·consultations·extractions·materials)
   ├─ ai/                   # answer(답변 초안)·extract(구조화 추출) — Claude
   ├─ convert/              # detect·ocr·stt(whisper) — 자료 변환 어댑터
   ├─ supabase/             # 클라이언트·서버·admin(service_role)·proxy
   ├─ auth.ts · staff.ts · permissions.ts   # 인증·직원·역할 권한
   └─ storage.ts · materials-status.ts
db/migrations/              # 0001_core ~ 0012 (스키마·트리거·시드)
scripts/                   # migrate.mjs · import-json.mjs · test-extract.mjs
docs/                      # 설계 문서
```

## 원칙이 코드/DB에서 강제되는 지점

| 원칙 | 강제 방법 |
|------|-----------|
| 물리삭제 금지 | `fn_block_delete` 트리거(업무·원본 테이블), 앱은 DELETE 미사용 |
| 원본 수정 금지 | `raw_messages` 등에 `fn_block_update` 트리거 |
| 삭제 = 비활성화 | `fn_deactivate(table,id,by)` 호출 |
| 변경이력 | `fn_audit` 트리거 → `audit_logs`(before/after jsonb) |
| 중복 업로드 차단 | 파일 해시 + 행 해시 유니크 |
| 인성 2차 연동 자리 | `source_system`/`external_id` 컬럼만 존재(미사용) |
| 자동 발송 없음 | AI 답변은 초안만, 승인 전 발송 경로 부재 |

## 설계 문서

`docs/` 폴더 참고 — [09 ERP DB·아키텍처](docs/09-erp-db-architecture.md) · [10 1차 개발 범위](docs/10-phase1-scope.md) · [11 P0 셋업](docs/11-p0-setup.md) · [12 구조화 추출](docs/12-structured-extraction.md).

## 다음 작업

- [ ] 세부 RBAC(거래처/배차/정산 화면 권한) — 로그인 뼈대 이후
- [ ] 원본 파일 Supabase Storage 전환(현재 로컬 `.data/`·`public/uploaded/`)
- [ ] 거래처/담당자/상담유형 마스터 + inline 등록 강화
- [ ] 상담 검수 필드·`consultation_images`·AI 초안 승인 흐름(P2~P4)
- [ ] 카카오 상담톡 실시간 웹훅 · 배차 추천(2차)
