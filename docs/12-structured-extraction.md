# 12. 상담 데이터 구조화 — AI 자동 추출 (화면 설계 + DB 구조)

> CSV/엑셀 업로드([11])로 적재된 대화에서 AI가 8개 항목을 자동 추출하고,
> 직원이 검토·수정하며, 모든 수정은 이력으로 남는다.
>
> 파이프라인 위치:
> `raw_messages`(원본 불변) → `parsed_messages`(분류·그룹화) →
> **`conversation_extractions`(구조화 추출)** → `ai_training_data`(학습)

---

## 0. 핵심 설계 결정

- **추출 항목은 "대화(상담) 1건" 단위** → `parsed_messages`(메시지 단위)가 아니라
  **신규 `conversation_extractions`(대화 단위)** 테이블에 저장한다.
  - 이유: 거래처/출발지/도착지/차량종류 등은 메시지 하나가 아니라 **대화 전체**를
    설명하는 값이다. 메시지별로 흩어 저장하면 "출발지는 어느 메시지?"가 모호해진다.
  - 원칙은 그대로: **원본(`raw_messages`)은 절대 수정·삭제 금지**(0003 트리거),
    추출/수정은 파생 계층에서만.
- **AI 원본과 직원 수정본을 분리 보존**: `ai_extracted`(AI 원본 스냅샷, 불변) +
  현재값 컬럼(직원 수정 가능) + `field_sources`(필드별 ai/human 출처).
- **변경 이력**: `fn_audit` 트리거가 모든 INSERT/UPDATE를 `audit_logs`에
  before/after(jsonb)로 기록 → 누가·언제·무엇을 바꿨는지 보존.
- **재추출 안전**: 직원이 고친 필드(`human`)는 AI 재추출이 덮어쓰지 않는다.

---

## 1. 추출 항목 (8개)

| 컬럼 | 항목 | 비고 |
|------|------|------|
| `client_name` | 거래처명 | 회사/상호 |
| `manager_name` | 담당자명 | 사람 이름 |
| `phone` | 연락처 | 한국 전화번호 우선 |
| `origin` | 출발지 | 상호/주소 |
| `destination` | 도착지 | 상호/주소 |
| `vehicle_type` | 차량종류 | 오토바이/다마스/라보/1톤 등 |
| `consultation_type` | 상담유형 | 짧은 명사구(퀵 접수, 운임 문의 …) |
| `is_urgent` | 긴급여부 | 즉시성 요구 시 true |

근거 없으면 `null`(추측 금지) + 항목별 `confidence`(0~1).

---

## 2. DB 구조 — `conversation_extractions` (마이그레이션 `0004_extractions.sql`)

```
conversation_extractions
├─ id, conversation_id → conversations(restrict)
├─ [현재값: 직원 수정 가능]  client_name · manager_name · phone · origin ·
│                            destination · vehicle_type · consultation_type · is_urgent
├─ [AI 원본/메타: 불변]      ai_extracted(jsonb) · ai_confidence(jsonb) · ai_model
├─ field_sources(jsonb)      {"origin":"human","phone":"ai", ...}  ← 필드별 출처
├─ status                    pending|extracted|edited|confirmed|failed
├─ reviewed_by · reviewed_at · error
└─ [공통 표준]               is_active · row_version · created_*/updated_*/deactivated_*
   trigger fn_audit         INSERT/UPDATE → audit_logs(before/after)   ← 변경이력
   trigger fn_block_delete  물리삭제 차단
   unique(conversation_id) where is_active   ← 대화당 활성 추출 1건
```

코드 위치:
- AI 어댑터: `src/lib/ai/extract.ts` (Anthropic SDK, 강제 tool use, 프롬프트 캐싱)
- DB 접근: `src/lib/db/extractions.ts` (`runExtraction`/`saveExtractionEdits`/`confirmExtraction`/`getExtractionHistory`)

### AI 추출 요청 형태 (요약)
- 모델: `claude-haiku-4-5`(저비용 분류용 기본, `ANTHROPIC_EXTRACT_MODEL`로 변경)
- **강제 tool use**: `tool_choice: {type:"tool", name:"save_consultation_fields"}` →
  8개 항목 + 항목별 `confidence`를 스키마로 보장
- **프롬프트 캐싱**: `system` + `tool` 스키마(안정 프리픽스)에 `cache_control`,
  대화 원문은 `messages`에 둠
  - 참고: Haiku 4.5의 캐시 최소 프리픽스는 4096 토큰 — 현재 system+tool은 그보다
    작아 실제 캐시는 프롬프트가 커질 때(예: few-shot 추가) 활성화된다.

---

## 3. 화면 설계

### (A) 목록 — `/chatlogs`
업로드 폼 + 통계 아래에 **"대화 · 상담 데이터 추출"** 목록을 추가:
```
┌ 대화 · 상담 데이터 추출 (N건) ───────────────────────────────┐
│ 하림_상담.csv             메시지 24건 · 06-02 14:36   [긴급] [확정] │
│ 리씽크_상담.csv           메시지 12건 · 06-01 10:11         [추출됨] │
│ 신규_상담.csv             메시지 8건                          [미추출] │
└──────────────────────────────────────────────────────────────┘
   (행 클릭 → 상세)         상태: 미추출/추출됨/수정됨/확정/실패
```

### (B) 상세/추출 — `/chatlogs/[id]`
좌우 2단. 왼쪽은 **원본 대화(읽기 전용)**, 오른쪽은 **추출 편집 + 이력**:
```
┌ 원본 대화 (수정 불가) ────────┐  ┌ 상담 데이터 (AI 추출)  [확정] haiku-4-5 ┐
│ [고객/김병준] 오토바이 1대…   │  │ 거래처명   [하림신선]        AI 92%        │
│ [직원]  출발지/도착지 알려…   │  │ 담당자명   [김병준]          AI 88%        │
│ [고객]  성수동 656 → 역삼…    │  │ 연락처     [010-…]           AI 70% 수정됨 │
│ [직원]  배차 완료, 5분 내…    │  │ 출발지     [성수동 656]      AI 81%        │
│        … (parsed_messages)    │  │ 도착지     [역삼동 825]      AI 79%        │
│                               │  │ 차량종류   [오토바이]        AI 95%        │
│                               │  │ 상담유형   [퀵 접수]         AI 85%        │
│                               │  │ 긴급여부   [긴급 ▼]          AI 60%        │
│                               │  │ [저장]  [AI 재추출]  [확정]                │
│                               │  └────────────────────────────────────────────┘
│                               │  ┌ 변경 이력 (audit_logs) ─────────────────────┐
│                               │  │ UPDATE  오현미 · 06-07 11:20                 │
│                               │  │ INSERT  오현미 · 06-07 11:18                 │
└───────────────────────────────┘  └─────────────────────────────────────────────┘
```
- **AI 추출 실행/재추출**: 대화 원문 → AI → 8개 항목 채움(`field_sources=ai`).
- **저장**: 직원이 고친 필드는 `field_sources=human`으로 표시되고, AI 신뢰도 옆에
  `수정됨` 뱃지가 붙는다. 변경 이력 자동 기록.
- **확정**: `status=confirmed`, 검수자/시각 기록.
- **신뢰도 색상**: ≥80% 초록 / ≥50% 주황 / 그 외 빨강 — 낮은 신뢰도부터 확인.

### 플로우
```
업로드(CSV/xlsx) → 대화 생성 → [목록에서 대화 선택]
  → [AI 추출 실행] → 8개 항목 + 신뢰도 표시
  → 직원 검토/수정(저장, 이력 기록) → [확정]
  → (확정 데이터는 향후 배차 오더/학습 데이터로 활용)
```

---

## 3.5 업로드 자동추출 & 검수 규칙 (정확성 우선)

> 방침: **자동화보다 정확성**. 자동추출은 "초안"이고, 확정은 사람이 한다.

| # | 요구사항 | 구현 |
|---|----------|------|
| 1 | CSV 업로드 완료 후 자동 실행 | 업로드 성공 → 클라이언트가 생성된 대화를 순차 자동추출 |
| 2 | 추출 실패해도 업로드는 성공 | 업로드 트랜잭션 commit 후 추출 별도 실행, 실패는 격리 |
| 3 | 실패 건은 "추출대기"로 표시 | `status='failed'` 를 화면에서 **추출대기**로 노출 |
| 4 | 수동 재추출 | 상세 화면 `[AI 재추출]` (사람 수정 필드는 보존) |
| 5 | 추출 진행률 표시 | 업로드 폼에 `진행률 바 (done/total · %)` |
| 6 | 검수 후 확정 | `[확정]` → `status='confirmed'`, 검수자·시각 기록 |
| 7 | 확정 전 배차 미사용 | 뷰 `v_dispatch_ready_extractions` = confirmed 만 |
| 8 | 신뢰도 70% 미만 검수필수 | `needs_review` + 사유, 빨강 뱃지 |
| 9 | 출발지/도착지/차량종류 누락 검수필수 | 위와 동일 규칙(REQUIRED_FIELDS) |
| 10 | 추출 로그 저장 | `extraction_logs`(성공/실패·소요시간·평균신뢰도·사유) |

### 검수필수(`needs_review`) 판정
- 필수항목(**출발지·도착지·차량종류**) 중 하나라도 비면 → 검수필수
- 임의 항목의 AI 신뢰도가 **70% 미만**이면 → 검수필수
  - 단, 직원이 직접 고친 필드(`field_sources=human`)는 신뢰도 검사에서 제외
- 목록/상세에 **검수필수** 뱃지 + 사유 표시. 확정하면 사라짐.

### 추출 로그 (`extraction_logs`, append-only)
시도마다 1행: `status(success|failed)` · `model` · `duration_ms` ·
`avg_confidence` · `needs_review` · `result`(스냅샷) · `error`. 삭제 금지(트리거).

### 배차 사용 가드 (req 7)
```sql
-- 배차 모듈(2차)은 이 뷰만 읽는다 → 미확정 데이터는 구조적으로 차단
create view v_dispatch_ready_extractions as
  select * from conversation_extractions where is_active and status='confirmed';
```

### 자동추출 플로우
```
업로드(CSV/xlsx) ──(commit, 항상 성공)──▶ 대화 생성
   └▶ 자동추출 시작 [진행률 바]
        성공 → status=extracted (+ 검수필수 판정)
        실패 → status=failed(=화면 "추출대기")  ← 업로드엔 영향 없음
   └▶ 직원: 검수필수 확인 → 수정(이력 기록) → [확정]
        확정만 v_dispatch_ready_extractions 에 노출(배차 사용 가능)
모든 시도는 extraction_logs 에 기록.
```

---

## 4. 사용 준비

```bash
# .env 에 추가
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_EXTRACT_MODEL=claude-haiku-4-5   # 정확도 우선이면 claude-sonnet-4-6

npm run db:migrate     # 0004 적용
npm run dev
# /chatlogs → 대화 선택 → AI 추출 실행
```

> 관련: [11 P0 셋업](11-p0-setup.md) · [10 1차 범위](10-phase1-scope.md) · [05 AI 파이프라인](05-ai-pipeline.md)
