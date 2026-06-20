-- ════════════════════════════════════════════════════════════════════
-- 0009_consultation_materials — 상담자료 업로드 통합(다양한 파일 → 텍스트 → AI추출)
--
--   지원: CSV·XLSX(메시지 파싱) / WAV·MP3·M4A(STT) / PNG·JPG·PDF(OCR)
--   흐름: 업로드(원본보관) → 변환(STT/OCR/파싱) → conversation 생성 → AI 추출
--   상태(라이프사이클):
--     uploaded(업로드완료) · converting(변환중) · convert_failed(변환실패) · converted
--     → 이후 표시상태는 추출(conversation_extractions)에서 파생:
--        추출대기 / 추출완료 / 검수필수 / 확정
--
--   원칙: 원본파일 보관(stored_path) · 변환결과 저장(converted_text) ·
--         물리삭제 금지(비활성화) · 모든 INSERT/UPDATE 변경이력(fn_audit).
-- ════════════════════════════════════════════════════════════════════

create table if not exists consultation_materials (
  id              uuid primary key default gen_random_uuid(),
  filename        text not null,
  -- 파일 종류(자동판별). kind 로 변환 경로 분기.
  file_type       text not null
                  check (file_type in ('csv','xlsx','wav','mp3','m4a','png','jpg','jpeg','pdf')),
  kind            text not null check (kind in ('chat','audio','image','pdf')),

  file_hash       text not null,              -- sha256(파일내용) — 동일 파일 재업로드 차단
  byte_size       bigint,
  stored_path     text,                       -- 원본 파일 보관 경로(1바이트도 변형 없이)

  -- 변환 결과/메타
  converted_text  text,                       -- STT/OCR 결과(채팅 CSV 는 parsed_messages 사용 → null)
  conversion_model text,                      -- whisper-1 / claude-… 등
  conversion_ms   int,
  conversion_error text,

  -- 변환 단계 상태(추출 단계 상태는 conversation_extractions 에서 파생)
  status          text not null default 'uploaded'
                  check (status in ('uploaded','converting','convert_failed','converted')),

  -- 변환으로 생성된 대화(추출 단위)
  conversation_id uuid references conversations(id) on delete restrict,

  -- 공통 표준(감사/버전/비활성화)
  is_active       boolean not null default true,
  row_version     int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references agents(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references agents(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid references agents(id)
);
create unique index if not exists uq_material_hash on consultation_materials(file_hash);
create index if not exists idx_material_status on consultation_materials(status) where is_active;
create index if not exists idx_material_conv on consultation_materials(conversation_id);
create index if not exists idx_material_created on consultation_materials(created_at desc) where is_active;

-- 변환 로그(append-only) — 시도마다 1행.
create table if not exists conversion_logs (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid references consultation_materials(id) on delete restrict,
  kind         text,
  status       text not null check (status in ('success','failed')),
  model        text,
  duration_ms  int,
  char_count   int,                            -- 변환 텍스트 길이
  error        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references agents(id)
);
create index if not exists idx_conversion_log_material on conversion_logs(material_id, created_at desc);

-- 트리거: 감사(변경이력) + 삭제차단
drop trigger if exists trg_audit_material on consultation_materials;
create trigger trg_audit_material before insert or update on consultation_materials
  for each row execute function fn_audit();
drop trigger if exists trg_nodelete_material on consultation_materials;
create trigger trg_nodelete_material before delete on consultation_materials
  for each row execute function fn_block_delete();
drop trigger if exists trg_nodelete_conversion_log on conversion_logs;
create trigger trg_nodelete_conversion_log before delete on conversion_logs
  for each row execute function fn_block_delete();
