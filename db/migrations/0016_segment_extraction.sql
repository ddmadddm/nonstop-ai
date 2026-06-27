-- ════════════════════════════════════════════════════════════════════
-- 0016_segment_extraction — ⑥ 분리 상담(세그먼트) 단위 AI 추출 지원
--
--   기존 추출(conversation_extractions)을 세그먼트 단위로 확장한다.
--     · segment_id = null  : 기존 대화 단위 추출(정상 크기 자료) — 동작 변화 없음
--     · segment_id 지정     : 대형 채팅방의 상담 단위별 추출(온디맨드)
--   활성 추출 유일성: (대화) → (대화, 세그먼트)로 완화.
-- ════════════════════════════════════════════════════════════════════

alter table conversation_extractions
  add column if not exists segment_id uuid references conversation_segments(id);

-- 기존 (conversation_id) 유일 인덱스 → (conversation_id, segment_id) 로 완화.
--   segment_id 가 null 인 행도 대화당 1건만 유지되도록 coalesce 로 정규화.
drop index if exists uq_extraction_conv;
create unique index if not exists uq_extraction_conv_seg
  on conversation_extractions
     (conversation_id, coalesce(segment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;

create index if not exists idx_extraction_segment
  on conversation_extractions(segment_id) where is_active;
