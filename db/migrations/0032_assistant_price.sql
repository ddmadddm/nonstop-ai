-- 0032_assistant_price — 논사원 답변에 요금 초안(직원 확인용) 스냅샷 저장.
alter table assistant_drafts
  add column if not exists price_draft jsonb;
