# data — 초기 시드 데이터

상담유형·FAQ 초기 데이터. 편집 후 `categories` / `faqs` 테이블에 임포트한다.

## 파일

| 파일 | 대상 테이블 | 설명 |
|------|-------------|------|
| `categories.seed.csv` | categories | 상담유형 트리(대/소분류). `key`/`parent_key`는 임포트 시 id 매핑용 임시 키 |
| `faqs.seed.csv` | faqs | FAQ 초안. `category_key`로 카테고리 연결, 답변은 **작성예시 → 실제 정책으로 교체 필요** |

## 컬럼 설명

**categories.seed.csv**
- `key`: 이 행의 임시 식별 키(임포트 스크립트가 uuid로 매핑)
- `parent_key`: 대분류면 비움, 소분류면 부모의 `key`
- `name`, `description`(분류 기준 — AI 프롬프트에 사용), `sort_order`

**faqs.seed.csv**
- `category_key`: 연결할 카테고리의 `key`(보통 소분류)
- `question`, `answer`, `keywords`(세미콜론 `;` 구분)

## 임포트 방법 (택1)

1. **Supabase Table Editor**에서 CSV 업로드 — 단, `key→uuid` 매핑은 수동/스크립트 필요.
2. **시드 스크립트**(권장): `key`로 카테고리를 먼저 insert하며 `key→id` 맵을 만들고, 그 맵으로 `parent_id`와 FAQ의 `category_id`를 채운 뒤 임베딩 생성. → 코드 단계에서 `scripts/seed.ts`로 작성 예정([06 로드맵](../docs/06-roadmap.md) 2단계).

## 주의
- FAQ `answer`의 `[작성예시]` 문구는 **실제 논스톱서비스 정책/멘트로 교체**해야 한다. 그대로 두면 AI가 예시 문구를 근거로 답변하게 됨.
- 인코딩 UTF-8. Excel에서 열어 깨지면 "데이터 → 텍스트/CSV 가져오기 → 65001:UTF-8"로 불러오기.
