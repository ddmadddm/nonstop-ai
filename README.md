# NONSTOP-AI · 논사원 AI

논스톱서비스(**퀵/화물 배차 중개**) 상담 데이터를 기반으로 한 AI 상담비서 **'논사원 AI'**.
반응형 웹 + PWA. 현재 **목업(mock) 모드** — Supabase/OpenAI/카카오 연동 전, 로컬 샘플 데이터로 동작.

## 실행

```bash
npm install      # 최초 1회
npm run dev      # http://localhost:3000  → /dashboard
```

## 구축 단계 (목표)

1. **상담 데이터 수집** ← 현재 단계
2. FAQ 자동 생성
3. AI 답변 초안 생성
4. 접수 자동화
5. 배차 추천

## 화면

| 경로 | 설명 |
|------|------|
| `/dashboard` | 단계 현황, 상담 통계, 유형 분포, 최근 상담 |
| `/conversations` | 상담 목록 (상태·유형 필터) |
| `/conversations/[id]` | 상담 상세 — 메시지 스레드 + 오더/배차 카드 + AI 답변 초안 |
| `/faqs` | FAQ 관리 |
| `/clients` · `/clients/[id]` | 거래처 / 거래처별 상담이력 |
| `/search` | 상담이력 검색 |
| `/settings` | 연동 상태·팀 |

## 구조

```
src/
├─ app/
│  ├─ layout.tsx            # 루트(한국어·PWA 메타)
│  ├─ page.tsx              # → /dashboard 리다이렉트
│  └─ (app)/                # 사이드바 셸이 적용되는 화면 그룹
│     ├─ dashboard | conversations | faqs | clients | search | settings
├─ components/              # AppShell, badges, OrderCard, AiDraftPanel
└─ lib/
   ├─ types.ts              # 도메인 타입
   ├─ categories.ts         # 상담유형 체계
   ├─ utils.ts
   └─ data/
      ├─ index.ts           # ★ 데이터 접근 계층 (지금=목업, 나중=Supabase)
      └─ mock.ts            # 실제 채널톡 스크린샷 기반 샘플
```

> **Supabase 연동 시**: `src/lib/data/index.ts`의 함수 구현만 DB 조회로 교체하면 화면 코드는 그대로 동작합니다.

## 설계 문서

`docs/` 폴더 참고 — [01 아키텍처](docs/01-architecture.md) · [02 DB 스키마](docs/02-database-schema.md) · [07 상담유형](docs/07-category-taxonomy.md) · [08 도메인 모델](docs/08-domain-model.md) 등.
시드 데이터: [data/](data/README.md).

## 다음 작업 (연동 전환)

- [ ] Supabase 프로젝트 생성 → `docs/02`의 마이그레이션 적용 → `lib/data` 실제 구현
- [ ] 카카오 상담톡 웹훅(`/api/kakao/webhook`) — 스펙 확정 후
- [ ] OpenAI 분류·임베딩·답변 파이프라인(`docs/05`)
- [ ] 로그인/권한(Supabase Auth)
- [ ] PWA 아이콘 PNG 세트(192/512) 보강, 서비스워커(오프라인) — 필요 시
