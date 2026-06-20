-- ════════════════════════════════════════════════════════════════════
-- 0010_assistant — 논사원 1차 답변 생성 기록(assistant_drafts)
--
--   파이프라인 위치:  [상담 문의 질문] → 키워드 검색(pg_trgm, 과거 기록) →
--                     Claude 답변문 초안 + 8개 추출항목 → [assistant_drafts]
--
--   · 상담원이 새 문의(질문)를 넣으면 논사원이 과거 상담 기록(parsed_messages /
--     ai_training_data / conversation_extractions)에서 근거를 찾아 1차 답변을 만든다.
--   · 생성된 답변/질문/근거를 이 테이블에 기록(기억)한다. 원본 기록은 건드리지 않는다.
--   · 표준 공통 컬럼(row_version/updated_at/updated_by/is_active)을 갖춰 fn_audit 부착.
-- ════════════════════════════════════════════════════════════════════

create table if not exists assistant_drafts (
  id            uuid primary key default gen_random_uuid(),

  -- ── 입력/출력 ──────────────────────────────────────────────────────
  question      text not null,                       -- 상담원이 넣은 문의(질문) 원문
  answer_draft  text,                                -- 논사원이 만든 1차 답변문 초안

  -- ── 질문에서 파악한 배차 8개 항목(거래처명/담당자명/연락처/출발지/
  --    도착지/차량종류/상담유형/긴급여부) — 추출 계층과 동일 키 구조 ──
  extracted     jsonb,                               -- {client_name:..., origin:..., is_urgent:...}
  confidence    jsonb,                               -- 항목별 신뢰도 0~1

  -- ── 근거(재현/신뢰성) ──────────────────────────────────────────────
  used_sources  jsonb not null default '[]'::jsonb,  -- 참고한 conversation id·발췌 목록
  ai_model      text,                                -- claude-sonnet-4-6 등

  status text not null default 'draft'
         check (status in ('draft','edited','sent')),

  -- ── 공통 표준(감사/버전/비활성화) ──────────────────────────────────
  is_active      boolean not null default true,
  row_version    int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references agents(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents(id),
  deactivated_at timestamptz,
  deactivated_by uuid references agents(id)
);

create index if not exists idx_assistant_drafts_created on assistant_drafts(created_at desc) where is_active;

-- 트리거: 감사(INSERT/UPDATE → audit_logs, 변경이력) + 삭제차단
drop trigger if exists trg_audit_assistant_drafts on assistant_drafts;
create trigger trg_audit_assistant_drafts before insert or update on assistant_drafts
  for each row execute function fn_audit();
drop trigger if exists trg_nodelete_assistant_drafts on assistant_drafts;
create trigger trg_nodelete_assistant_drafts before delete on assistant_drafts
  for each row execute function fn_block_delete();
