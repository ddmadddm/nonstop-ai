# 11. P0 셋업 가이드 — Postgres 전환 & 상담로그 학습 파이프라인

> DB 호스팅 확정: **Supabase Postgres** (Auth/Storage/RLS 활용). 단, 스키마·쿼리는
> **표준 PostgreSQL** 기준(`postgres.js` 드라이버 + `DATABASE_URL`)으로 작성되어
> 추후 다른 Postgres로 이전 가능. Supabase 종속은 최소화한다.

이 문서는 [10 1차 개발 범위](10-phase1-scope.md)의 **P0** 와, 추가 요청된
**카카오 상담톡 원본 업로드 → 학습 데이터 파이프라인**의 설치/사용법이다.

---

## 1. 이번에 만든 것

### P0 — Postgres 전환 & 코어
- 마이그레이션 `db/migrations/`
  - `0001_core.sql` — `pgcrypto`/`pg_trgm`, `agents`, `audit_logs`,
    함수 `fn_audit`(⑤ 변경이력) · `fn_block_delete`(② 물리삭제 차단) ·
    `fn_block_update`(원본 수정 차단) · `fn_deactivate`(④ 비활성화)
  - `0002_consultations_p0.sql` — `consultations`(기존 MVP 이관용, 감사·삭제차단 트리거)
- DB 접근 계층 `src/lib/db/` (기존 `src/lib/store.ts` JSON 구현을 대체)
  - 화면이 쓰던 `src/lib/data/index.ts` 인터페이스는 **그대로 유지**(구현만 교체)
- 1회 이관 스크립트 `scripts/import-json.mjs` — `.data/consultations.json` →
  `consultations` (원본 JSON 보존, 원본 id 를 `external_id` 에 보관 → 멱등)
- **`삭제` 제거 → 비활성화(`fn_deactivate`)** 로 교체(자료 업로드 화면)

### 추가 — 상담로그 학습 파이프라인 (`0003_chatlog_pipeline.sql`)
카카오 상담톡 **원본 엑셀(.xlsx)/CSV(UTF-8)** 업로드 → 3계층 적재:

```
raw_messages         원본 1행 = 1행 (절대 수정·삭제 금지: 트리거로 강제)
   └→ parsed_messages   sender_type 분류(논스톱서비스=staff, 그외=customer) + 대화 그룹화 + 시각파싱
        └→ ai_training_data  (직전 고객 발화) → (직원 응답) Q&A 쌍 — 논사원 AI 학습용
```
- 업로드 이력/로그: `chat_upload_batches` (파일명·해시·건수·상태·업로더)
- **중복 차단**: 파일 해시(`file_hash`) + 행 해시(`row_hash`) 유니크
- **원본 파일 보관**: `.data/uploads/<해시>.<확장자>` (추후 Supabase Storage 이전)
- **UTF-8 한글 보존**: CSV 는 UTF-8 디코드 + BOM 제거, 원문 그대로 저장
- 필수 컬럼(별칭·대소문자·공백 무시): `DATE` / `USER` / `MESSAGE`
  - 화면: 좌측 메뉴 **상담로그 업로드** (`/chatlogs`)

---

## 2. 설치 & 실행 (한 번만)

```bash
# 1) 의존성
npm install

# 2) 환경변수 — .env.example 을 복사해 .env 생성 후 DATABASE_URL 채우기
cp .env.example .env
#   Supabase 대시보드 > Project Settings > Database > Connection string
#   예: postgresql://postgres:비밀번호@db.<ref>.supabase.co:5432/postgres
#   (비밀번호 특수문자는 URL 인코딩)

# 3) 마이그레이션 적용 + 기존 JSON 이관(한 번에)
npm run db:setup
#   = npm run db:migrate  (db/migrations/*.sql 순서대로, _migrations 에 이력)
#   + npm run db:import   (.data/consultations.json → consultations)

# 4) 개발 서버
npm run dev
```

> `npm run db:migrate` 는 이미 적용된 마이그레이션은 건너뛴다(재실행 안전).
> `npm run db:import` 는 멱등(중복 import 없음).

### 동작 확인
- `/uploads` — 이관된 기존 상담자료가 보이고, "비활성화"(삭제 아님)로 처리됨
- `/chatlogs` — `docs/samples/chatlog-sample.csv` 를 업로드 → 통계(원본/대화/학습쌍) 증가,
  같은 파일 재업로드 시 "이미 업로드된 파일입니다(중복)" 표시

---

## 3. 원칙이 코드/DB에서 강제되는 지점

| 원칙 | 강제 방법 |
|------|-----------|
| ② 물리삭제 금지 | `fn_block_delete` 트리거(모든 업무/원본 테이블), 앱은 DELETE 미사용 |
| 원본 수정 금지 | `raw_messages` 에 `fn_block_update` 트리거 |
| ④ 삭제=비활성화 | `fn_deactivate(table,id,by)` — `consultations` 삭제 버튼이 호출 |
| ⑤ 변경이력 | `fn_audit` 트리거 → `audit_logs` 에 before/after(jsonb) |
| 중복 업로드 차단 | `uq_chat_batch_hash`(파일) + `uq_raw_row`(행) |
| ① 인성 2차 연동 자리 | `source_system`/`external_id` 컬럼만 존재(미사용) |

---

## 4. 아직 안 한 것 (다음 단계)

- **Supabase Auth 로그인** + `agents.auth_uid` 연계, **RLS** 정책 — P0 이후.
  현재는 `DATABASE_URL`(서버 전용)로 직접 접속하므로 RLS 무관하게 동작.
- 이미지/원본파일 **Supabase Storage** 전환 (현재 로컬 `.data/`·`public/uploaded/`).
- 거래처/담당자/상담유형 **마스터 테이블 + 선택/inline 등록** (P1, `0002` 확장).
- 상담 검수 필드·`consultation_images`·OCR·AI 초안 (P2~P4).

> 관련: [10 1차 범위](10-phase1-scope.md) · [09 ERP DB·아키텍처](09-erp-db-architecture.md)
