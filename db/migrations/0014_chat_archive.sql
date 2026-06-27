-- ════════════════════════════════════════════════════════════════════
-- 0014_chat_archive — 대형 카카오톡 채팅방 '원본 자료실'(보관) + 라이프사이클 상태
--
--   배경: 오래된 대형 채팅방 TXT는 단일 상담이 아니라 수개월치 수백~수천 건이 섞여 있다.
--         즉시 AI 추출하지 않고 '원본 자료실'에 보관한 뒤, 추후 단계적으로 분석/분리/학습한다.
--
--   원칙(요구사항):
--     · 원본 데이터(raw_messages/parsed_messages)는 절대 삭제·수정하지 않는다(기존 트리거로 강제).
--     · 분리본(상담 단위)·AI 결과는 별도 테이블에 저장한다(원본 불변, 파생물 분리).
--
--   라이프사이클(archive_status):
--     archived(보관중) → analyzed(분석완료) → segmented(분리완료) → learned(AI학습완료)
--       · archived  : 원본 보관, 분석 전           ← 이번 단계(현재 구현)
--       · analyzed  : 자동 분석(거래처추정·기간·참여자) 완료
--       · segmented : 상담 단위 자동 분리 완료
--       · learned   : 분리 상담별 AI 추출 + 거래처 지식베이스 구축 완료
--     (전체 설계: docs/13-large-chat-segmentation.md)
-- ════════════════════════════════════════════════════════════════════

alter table consultation_materials
  add column if not exists is_archive boolean not null default false,
  add column if not exists archive_status text
    check (archive_status in ('archived','analyzed','segmented','learned'));

create index if not exists idx_material_archive
  on consultation_materials(archive_status) where is_active and is_archive;

-- 백필: 이미 올라온 대형 채팅방(연결 대화 메시지 > 400)을 '보관중'으로 표시.
--   (임계값은 코드의 AUTO_EXTRACT_MAX_MESSAGES 기본값과 동일)
update consultation_materials m
set is_archive = true, archive_status = 'archived'
from conversations c
where m.conversation_id = c.id
  and m.kind = 'chat' and m.is_active
  and c.message_count > 400
  and m.is_archive = false;
