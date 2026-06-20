-- ════════════════════════════════════════════════════════════════════
-- 0011_txt_support — 카카오톡 '대화 내보내기' .txt 업로드 허용
--
--   상담자료(.txt: 오픈채팅방 등 카카오톡 평문 내보내기)를 chat 파이프라인으로
--   처리할 수 있도록 file_type CHECK 제약에 'txt' 를 추가한다.
--   · consultation_materials.file_type  (0009)
--   · chat_upload_batches.file_type     (0003)
-- ════════════════════════════════════════════════════════════════════

alter table consultation_materials drop constraint if exists consultation_materials_file_type_check;
alter table consultation_materials add constraint consultation_materials_file_type_check
  check (file_type in ('csv','xlsx','txt','wav','mp3','m4a','png','jpg','jpeg','pdf'));

alter table chat_upload_batches drop constraint if exists chat_upload_batches_file_type_check;
alter table chat_upload_batches add constraint chat_upload_batches_file_type_check
  check (file_type in ('xlsx','csv','txt'));
