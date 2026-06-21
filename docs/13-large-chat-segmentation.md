# 13. 대형 카카오톡 채팅방 — 원본 자료실 + 분석/분리/학습 파이프라인 (설계)

## 배경 / 문제

상담자료 업로드는 "파일 1개 = 대화 1건 = AI 추출 1건"을 전제로 한다. 그러나 **오래된 대형
카카오톡 채팅방 export**는 수개월치 수백~수천 건의 상담이 한 방에 누적돼 있어 단일 추출이
무의미하고(거래처/출발지/도착지 8항목을 한 세트로만 뽑음), 입력만 9만~15만 토큰짜리 대형
과금 호출이 된다.

- 예: `대운로직스 두산.txt` — 8,019 메시지 ≈ 1,779건 주문 상담(이 중 1,267건 배차완료).

→ 대형 방은 **즉시 추출하지 않고 원본 자료실에 보관**한 뒤, 단계적으로 분석·분리·학습한다.

## 원칙 (요구사항)

1. **원본 불변·삭제 금지**: `raw_messages`/`parsed_messages`는 절대 수정·삭제하지 않는다
   (기존 `fn_block_update`/`fn_block_delete` 트리거로 강제). 업로드 원본 파일도 `stored_path`에 보관.
2. **파생물 분리**: 분리본(상담 단위)·AI 추출·지식베이스는 **별도 테이블**에 저장. 원본은 그대로 둔다.
3. **비활성화로만 제거**: 파생물도 물리삭제 금지(`is_active=false`), 변경이력은 `audit_logs` 자동 기록.

## 라이프사이클 (archive_status) — 0014에서 도입

```
archived(보관중) → analyzed(분석완료) → segmented(분리완료) → learned(AI학습완료)
```

| 상태 | 의미 | 단계 |
|---|---|---|
| **보관중** archived | 원본 보관, 분석 전 | **구현됨** |
| **분석완료** analyzed | 자동 분석(거래처추정·기간·참여자) 완료 | **구현됨** ①~④ |
| **분리완료** segmented | 상담 단위 자동 분리 완료 | **구현됨** ⑤ |
| **AI학습완료** learned | 분리 상담별 추출 + 거래처 지식베이스 구축 완료 | **구현됨** ⑥⑦ |

`consultation_materials.is_archive` / `archive_status` 컬럼으로 관리(0014). 표시 배지는
`materials-status.ts`의 `STATUS_META`에 매핑(보관중/분석완료/분리완료/AI학습완료).

## 7단계 파이프라인

```
대형 TXT 업로드
  └─ [현재] 원본 보관(archived/보관중)  ── 원본+변환(raw/parsed) 불변 보관, 자동추출 안 함
        │
        ├─① 대형 TXT 자동 분석 ─┬─② 거래처 추정      → analyzed
        │                       ├─③ 기간 분석
        │                       └─④ 참여자 분석
        │
        ├─⑤ 상담 단위 자동 분리   segmentChatMessages()        → segmented   [코어 구현됨]
        │
        ├─⑥ 분리 상담별 AI 추출   runExtraction(segment) + 매칭
        │
        └─⑦ 거래처 지식베이스 자동 구축                          → learned
```

각 단계는 **원본을 읽기만** 하고 결과를 파생 테이블에 적재한다. 단계는 독립 재실행 가능(아이덴포턴트).

## 현재 구현 (이번 단계 = 원본 보관)

`convertMaterial`(`src/lib/db/materials.ts`):

| 자료 종류 | 동작 |
|---|---|
| 정상 크기 TXT/CSV/XLSX(채팅) | 변환 + **자동 AI 추출** |
| 음성·이미지·PDF | 변환 + **자동 AI 추출**(단일 상담) |
| **대형 채팅방 TXT/CSV (> `AUTO_EXTRACT_MAX_MESSAGES`=400)** | 원본+변환 보관, **추출 보류** → `is_archive=true, archive_status='archived'`(보관중) |

- 원본 파일은 `stored_path`, 구조화 원본은 `raw_messages`/`parsed_messages`(불변)로 보존.
- 추출/분리/지식베이스 등 파생물은 만들지 않음(보관중 상태). 0014 백필로 기존 대형 방도 보관중 처리.

## ① 자동 분석 (②거래처 추정 · ③기간 · ④참여자)

원본(parsed_messages)만으로 값싸게 산출하는 메타 분석. 결과를 `chat_archive_analysis`에 저장.

- **② 거래처 추정**: 방 제목/파일명 + 고객 발화자명 빈도 + 본문 상호 패턴(㈜/주식회사/대표님/이사님 등)으로
  대표 거래처 후보를 추정 → 기존 `clients`와 유사도 매칭(이미 구현된 `pg_trgm`/`generateMatches` 재사용).
- **③ 기간 분석**: `min/max(sent_at)`, 활동 일수, 월별 건수, 피크 시간대.
- **④ 참여자 분석**: 발화자별 메시지 수, staff/customer 비율, 주요 담당자(직원) 식별(`agents` 명단 대조).

산출물은 "이 방은 OO거래처(추정), 2025-01~2026-06, 8,019건, 고객 3명/직원 5명" 같은 요약 카드.

## ⑤ 상담 단위 자동 분리 — `src/lib/import/segment.ts` (코어 구현됨)

`segmentChatMessages(messages, { gapMinutes, minMessages })` — AI 비용 0의 결정적 규칙 분리.

| # | 규칙 | 신호 | 경계 동작 |
|---|---|---|---|
| 1 | 접수방법 메시지(접수/요청/주문/오더) | `intake` | 고객 발화 + 현재 세그먼트가 이미 주문/배차를 거친 경우 → 새 상담 |
| 2 | 출발/도착/물품/차종/결제 키워드 | `order` | 단독 경계 아님(과분할 방지). 세그먼트 신호 + (1)의 전제 |
| 3 | 배차정보 메시지(기사 배정 = 종료) | `dispatch` | 직전 메시지가 배차면 다음 메시지부터 새 상담 |
| 4 | 대화 공백(기본 ≥ 120분) | — | 공백 직후 새 상담 |
| 5 | 거래처/담당자명 변경(발화자) | `clientHint` | 발화자 변경 시 새 상담 |

마지막에 주문 내용이 없는 잡담·짧은 조각은 직전 상담으로 병합.

**실측(`대운로직스 두산.txt`)**: 8,019 메시지 → **1,779 상담 단위**(전부 주문 포함, 1,267건 배차완료, 중앙값 3메시지).
트리거 분포 dispatch 1,238 · intake 489 · gap 181 · sender 19.

## ⑥ 분리 상담별 AI 추출 + 매칭

- 세그먼트 범위(start_seq~end_seq)로 `getTranscript`를 한정 → `runExtraction`을 **세그먼트 단위**로 실행.
  시그니처를 `runExtraction(conversationId, { segmentId, range })`로 확장.
- 추출 결과를 `generateMatches`(`src/lib/db/clients.ts`)로 거래처/담당자/출발지/도착지 매칭(구현됨 재사용).
- 대량(예: 1,267건)이므로 **배치 + 진행률 + 토큰/비용 상한 + 중단/재개**. dedup_hash(=conversation+seq)로 1회만.

## ⑦ 거래처 지식베이스 자동 구축

분리·추출·매칭 결과를 거래처별로 집계해 "거래처 지식"으로 축적 → 접수/배차/답변 자동화의 근거.

- 거래처별: 자주 쓰는 출발지/도착지(주소록 자동 보강), 자주 쓰는 차종/결제, 단가/요금 패턴, 담당자,
  상담 빈도·계절성, 대표 요청 템플릿.
- 저장: `client_knowledge`(거래처별 집계 jsonb + 근거 세그먼트 링크). 기존 `client_addresses`/`client_contacts`는
  매칭 확정 시 자동 보강(직원 검수 후 반영 — 이미 구현된 매칭 후보 흐름 재사용).

## 데이터 모델 (제안 마이그레이션 0015~)

```sql
-- 자동 분석 결과(①~④)
create table chat_archive_analysis (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,
  client_guess text, client_id uuid references clients(id),     -- ② 거래처 추정/매칭
  period_start timestamptz, period_end timestamptz, active_days int,  -- ③ 기간
  participants jsonb,                                            -- ④ 참여자 통계
  summary jsonb,
  is_active boolean not null default true, /* + 공통 표준/감사 컬럼 */
  ...
);

-- 상담 단위(⑤)
create table conversation_segments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete restrict,
  seq int not null, start_seq int not null, end_seq int not null, message_count int not null,
  started_at timestamptz, ended_at timestamptz,
  triggers jsonb not null default '[]', signals jsonb not null default '{}', client_hint text,
  is_active boolean not null default true, /* + 공통 표준/감사 */
  ...
);
create unique index uq_segment_conv_seq on conversation_segments(conversation_id, seq) where is_active;

-- 추출을 세그먼트 단위로 확장(⑥) — 기존 대화 단위 추출과 호환
alter table conversation_extractions add column segment_id uuid references conversation_segments(id);
-- 활성 추출 유일성: (대화) → (대화, 세그먼트)로 완화
-- 매칭 후보에도 segment_id 추가

-- 거래처 지식베이스(⑦)
create table client_knowledge (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  kind text,                 -- frequent_origin | frequent_destination | vehicle | payment | template ...
  value jsonb,               -- 집계값
  evidence jsonb,            -- 근거 segment/extraction 링크
  is_active boolean not null default true, /* + 공통 표준/감사 */
  ...
);
```

모든 파생 테이블은 `fn_audit` + `fn_block_delete`(물리삭제 금지) 트리거 부착. 원본 테이블은 변경하지 않는다.

## UI 설계

- **상담자료 목록**: 대형 방은 **보관중/분석완료/분리완료/AI학습완료** 배지로 표시(구현됨).
- **원본 자료실 상세**: 분석 요약 카드(거래처 추정·기간·참여자) + [분석] [상담 분리] [전체 추출] [지식베이스 구축] 단계 버튼.
- **세그먼트 목록**: 시작시각·고객·트리거·추출상태. 클릭 → 좌측 원문 구간, 우측 추출(ExtractionPanel)·매칭(MatchCandidates) 재사용.
- 세그먼트 경계 수동 조정(병합/분할) + 재추출(후속).

## 안전장치 / 롤아웃

- 기능 플래그 + `AUTO_EXTRACT_MAX_MESSAGES` 임계로 점진 적용. 대형 방은 기본 **보관중**으로 안전 보관.
- 원본(raw/parsed)·업로드 파일 불변. 분석/분리/추출/지식베이스는 모두 파생 테이블 + `is_active` 비활성화.
- 분리·추출은 후보일 뿐 — 직원 검수로 확정. 잘못돼도 원본은 그대로이므로 언제든 재실행.
- 대량 처리: 배치/진행률/토큰·비용 상한/중단·재개.

## 향후 / 튜닝

- 규칙 키워드·임계(`gapMinutes`, `AUTO_EXTRACT_MAX_MESSAGES`) 실데이터 튜닝.
- 애매 경계는 ⑤ 이후 AI 보정 패스.
- 방 유형 프로파일(거래처 단톡=발화자 고정 → rule5 비활성 등).
- 지식베이스 → 접수/배차/논사원 답변 자동화에 근거로 연결.
