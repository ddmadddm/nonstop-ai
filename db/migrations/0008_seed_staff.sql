-- ════════════════════════════════════════════════════════════════════
-- 0008_seed_staff — 논스톱서비스 초기 직원 명단 + 시스템(발화자) 계정
--   · 실직원 14명(이름·직급·부서·권한·이메일)
--   · 시스템 계정 3개(채널톡/카카오 발화자 구분용, is_system=true, email NULL)
--   · INSERT 시 fn_audit 트리거가 audit_logs 에 자동 기록(변경이력 보존)
--   · 물리삭제 금지 — 퇴사 등은 is_active=false 비활성화로 처리
--   · 재실행 안전: 이메일/시스템 계정명 기준 ON CONFLICT DO NOTHING
-- ════════════════════════════════════════════════════════════════════

-- ── 실직원 14명 ──────────────────────────────────────────────────────
insert into agents (name, position, department, role, email) values
  ('김보형', '대표', '대표',         'owner',   'nonstop8058@gmail.com'),
  ('김찬주', '차장', '영업·대외협력', 'admin',   'rumjoooooo33@gmail.com'),
  ('김수정', '이사', '경영지원부',     'admin',   'semi650200@gmail.com'),
  ('김예본', '차장', '경영지원부',     'manager', 'prettyborn13824@gmail.com'),
  ('조한결', '대리', '경영지원부',     'staff',   'lpkocvc@gmail.com'),
  ('서장현', '부장', '배차부',         'manager', 'jhseo0616@gmail.com'),
  ('김미선', '차장', '배차부',         'staff',   'lk01076900@gmail.com'),
  ('박경선', '과장', '배차부',         'staff',   'a01022086256@gmail.net'),
  ('방미라', '차장', '접수부',         'manager', 'apragl531@gmail.com'),
  ('김민정', '과장', '접수부',         'staff',   'sseol96@gmail.com'),
  ('김경아', '과장', '접수부',         'staff',   'gyeongagim459@gmail.com'),
  ('오현미', '과장', '접수부',         'staff',   'blackrice7874@gmail.com'),
  ('정태신', '대리', '접수부',         'staff',   'jtaeshin@gmail.com'),
  ('김주경', '대리', '접수부',         'staff',   'skyasljugyeong@gmail.com')
on conflict (email) where email is not null do nothing;

-- ── 시스템(발화자) 계정 — 상담톡 staff 판별/AI 추출 제외용 ─────────────
--   email 이 NULL 이라 위 유일 인덱스에 안 걸리므로 이름 중복만 방지.
insert into agents (name, position, department, role, email, is_system)
select v.name, '시스템', '시스템', 'system', null, true
from (values ('논스톱서비스'), ('논스톱'), ('논스톱서비스 접수팀')) as v(name)
where not exists (
  select 1 from agents a where a.name = v.name and a.is_system
);
