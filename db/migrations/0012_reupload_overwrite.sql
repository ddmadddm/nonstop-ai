-- ════════════════════════════════════════════════════════════════════
-- 0012_reupload_overwrite — 소프트삭제 후 재업로드 허용 + 동일내용 덮어쓰기
--
--   문제: 자료 삭제는 소프트삭제(is_active=false)인데, 콘텐츠 해시(file_hash)
--         유니크 인덱스가 비활성 행까지 포함해 "중복 파일"로 재업로드를 막았다.
--   해결: 유니크 범위를 '활성 행'으로 한정한다(partial index). 그러면
--         · 삭제(비활성)된 자료와 동일 내용을 다시 올릴 수 있고,
--         · 활성 상태의 동일 내용은 앱이 기존본을 비활성화(덮어쓰기)한 뒤 새로 적재한다.
--   원본/이력은 그대로 보존(물리삭제 금지 유지).
--
--   raw_messages.row_hash / ai_training_data.dedup_hash 는 앱에서 시드를
--   배치ID·대화ID(업로드마다 고유) 기준으로 바꿔 재업로드 충돌을 없앤다(인덱스는 그대로 유효).
-- ════════════════════════════════════════════════════════════════════

-- (1) 상담자료: 활성 행만 유일
drop index if exists uq_material_hash;
create unique index if not exists uq_material_hash_active
  on consultation_materials(file_hash) where is_active;

-- (2) 채팅 업로드 배치: 소프트삭제 컬럼 추가 + 활성 행만 유일
alter table chat_upload_batches add column if not exists is_active      boolean not null default true;
alter table chat_upload_batches add column if not exists deactivated_at timestamptz;
alter table chat_upload_batches add column if not exists deactivated_by uuid references agents(id);

drop index if exists uq_chat_batch_hash;
create unique index if not exists uq_chat_batch_hash_active
  on chat_upload_batches(file_hash) where is_active;
