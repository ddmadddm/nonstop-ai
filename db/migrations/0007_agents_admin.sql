-- ════════════════════════════════════════════════════════════════════
-- 0007_agents_admin — 직원관리(Admin) 대비 agents 확장/정정
--   · department: 시스템 계정용 '시스템' 추가 + '영업/대외협력' → '영업·대외협력' 정정
--   · role: 발화자 분류 전용 'system' 권한 추가(로그인 불가)
--   · memo(직원 메모) 컬럼 추가
--   (agents 가 비어 있어 기존 데이터 변환 이슈 없음)
-- ════════════════════════════════════════════════════════════════════

-- 부서: 5개 실부서 + 시스템 계정용 '시스템'
alter table agents drop constraint if exists agents_department_check;
alter table agents add constraint agents_department_check
  check (department in ('대표','영업·대외협력','경영지원부','배차부','접수부','시스템'));

-- 권한: 시스템 계정(발화자 분류 전용, 로그인 불가)용 'system' 추가
alter table agents drop constraint if exists agents_role_check;
alter table agents add constraint agents_role_check
  check (role in ('owner','admin','manager','staff','viewer','system'));

-- 직원 메모
alter table agents add column if not exists memo text;
