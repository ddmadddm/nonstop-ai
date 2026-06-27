-- 0021_assistant_requested_mode — 답변 생성 시 직원이 선택한 거래처 구분(라디오) 보존.
--   client_mode 는 인식 후 '확정된' 구분(general|key_client|new_candidate),
--   requested_mode 는 직원이 고른 값(auto 포함). 필터의 '자동판단'은 requested_mode='auto'.
alter table assistant_drafts
  add column if not exists requested_mode text
    check (requested_mode in ('auto','general','key_client','new_candidate'));
create index if not exists idx_drafts_reqmode on assistant_drafts(requested_mode) where is_active;
