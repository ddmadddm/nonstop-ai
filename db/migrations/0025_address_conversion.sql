-- ════════════════════════════════════════════════════════════════════
-- 0025_address_conversion — 주소 신/구 변환 + 가격표 기준 지역
--
--   배경: 고객은 신주소(도로명)로 문의하지만 운임/가격표는 구주소(지번/동) 기준.
--         추출된 출발지/도착지를 신주소·구주소·가격표 기준 지역으로 변환·저장한다.
--   변환은 외부 API 없이 AI 추정 + 거래처 주소록(client_addresses) 기반(어댑터 구조).
--   신뢰도가 낮으면 address_conversion_status='needs_review'(직원 확인 필요).
--   변경이력은 기존 fn_audit 트리거가 자동 기록.
-- ════════════════════════════════════════════════════════════════════

alter table conversation_extractions
  add column if not exists origin_raw            text,  -- 원문 주소(추출값 그대로)
  add column if not exists origin_address_kind   text   -- road|jibun|area|incomplete
    check (origin_address_kind is null or origin_address_kind in ('road','jibun','area','incomplete')),
  add column if not exists origin_road_address   text,  -- 신주소(도로명)
  add column if not exists origin_jibun_address  text,  -- 변환 구주소(지번/동)
  add column if not exists origin_pricing_area   text,  -- 가격표 기준 지역
  add column if not exists destination_raw           text,
  add column if not exists destination_address_kind  text
    check (destination_address_kind is null or destination_address_kind in ('road','jibun','area','incomplete')),
  add column if not exists destination_road_address  text,
  add column if not exists destination_jibun_address text,
  add column if not exists destination_pricing_area  text,
  add column if not exists address_conversion_status text   -- pending|resolved|needs_review|failed
    check (address_conversion_status is null or address_conversion_status in ('pending','resolved','needs_review','failed')),
  add column if not exists address_conversion_confidence numeric;

-- 거래처 주소록에도 신/구/가격표 기준 지역을 함께 보관(향후 변환 캐시·정답 소스).
alter table client_addresses
  add column if not exists road_address  text,  -- 신주소(도로명)
  add column if not exists jibun_address text,  -- 구주소(지번/동)
  add column if not exists pricing_area  text;  -- 가격표 기준 지역
