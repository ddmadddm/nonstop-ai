-- ════════════════════════════════════════════════════════════════════
-- 0017_segment_match — ⑥ 세그먼트(상담 단위) 단위 거래처 매칭 지원
--
--   client_match_candidates 를 세그먼트 단위로 확장한다.
--     · segment_id = null : 기존 대화 단위 매칭(정상 크기 자료) — 동작 변화 없음
--     · segment_id 지정    : 대형 채팅방의 상담 단위별 매칭
--   유일성: (대화, 후보종류) → (대화, 세그먼트, 후보종류) 로 완화.
-- ════════════════════════════════════════════════════════════════════

alter table client_match_candidates
  add column if not exists segment_id uuid references conversation_segments(id);

drop index if exists uq_match_conv_field;
create unique index if not exists uq_match_conv_field_seg
  on client_match_candidates
     (conversation_id, coalesce(segment_id, '00000000-0000-0000-0000-000000000000'::uuid), field_type)
  where is_active;

create index if not exists idx_match_segment
  on client_match_candidates(segment_id) where is_active;
