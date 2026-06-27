-- 0026_assistant_address — 논사원 답변에 주소 변환(신/구/가격표) 결과 저장.
--   생성 시점의 출발/도착 주소 변환 스냅샷을 보관해 답변 상세에서 재호출 없이 표시.
alter table assistant_drafts
  add column if not exists address_conversion jsonb;
