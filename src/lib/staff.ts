// 직원관리 공용 상수 — 서버/클라이언트 양쪽에서 import (서버 의존성 없음).
//   DB CHECK 제약(0007_agents_admin.sql)과 반드시 일치해야 한다.

// 실부서 5개(시스템 계정의 '시스템'은 화면 지정 대상이 아니라 제외).
export const DEPARTMENTS = [
  "대표",
  "영업·대외협력",
  "경영지원부",
  "배차부",
  "접수부",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

// 화면에서 지정 가능한 권한(시스템 계정 전용 'system'은 제외).
export const ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  owner: "대표",
  admin: "관리자",
  manager: "매니저",
  staff: "직원",
  viewer: "조회",
  system: "시스템",
};

export const ROLE_BADGE: Record<string, string> = {
  owner: "bg-rose-100 text-rose-700",
  admin: "bg-violet-100 text-violet-700",
  manager: "bg-sky-100 text-sky-700",
  staff: "bg-slate-100 text-slate-600",
  viewer: "bg-slate-100 text-slate-500",
  system: "bg-amber-100 text-amber-700",
};
