-- ════════════════════════════════════════════════════════════════════
-- 0024_client_extras — 거래처 유형 + 담당자 카카오 표시명 + 상담 유입 채널
--   거래처 CRM(0013) 보강. 모두 additive(기존 데이터 보존).
--     · clients.client_type        : 주거래처/일반거래처/1회성/잠재고객
--     · client_contacts.kakao_display_name : 카카오 상담 표시명(매칭 보조)
--     · conversations.inbound_channel       : 상담 유입 채널(6종)
--   변경이력은 기존 fn_audit 트리거가 자동 기록.
-- ════════════════════════════════════════════════════════════════════

-- 거래처 유형
alter table clients
  add column if not exists client_type text not null default '일반거래처'
    check (client_type in ('주거래처','일반거래처','1회성','잠재고객'));
create index if not exists idx_clients_type on clients(client_type) where is_active;

-- 담당자 카카오 표시명(오픈톡/채널 닉네임 → 발화자 매칭 보조)
alter table client_contacts
  add column if not exists kakao_display_name text;
create index if not exists idx_contacts_kakao_trgm
  on client_contacts using gin (kakao_display_name gin_trgm_ops);

-- 상담 유입 채널(상담 단위) — conversations 에 저장.
--   기존 conversations.channel('upload'·'kakao' 등 내부값)과 별개의 업무 분류값.
alter table conversations
  add column if not exists inbound_channel text
    check (inbound_channel in ('카카오채널','카카오오픈톡','전화','문자','채널톡','기타'));
