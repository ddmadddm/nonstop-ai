// 카카오 상담톡 원본(.xlsx / .csv UTF-8 / .txt 카카오톡 내보내기) 파서.
//   - .txt 는 카카오톡 '대화 내보내기' 평문 → parseKakaoTxt 가 (date,user,message)로 환원.
//   - .xlsx/.csv 는 필수 컬럼(별칭 허용, 대소문자/공백 무시): DATE, USER, MESSAGE
//       DATE    ← date, date_time, datetime, 일시, 날짜, time, 시간
//       USER    ← user, user_name, username, name, 이름, 보낸사람, 발신자, 작성자
//       MESSAGE ← message, msg, content, text, 내용, 메시지, 메세지
//   - 한글 깨짐 방지: CSV 는 인코딩을 자동 판별해 디코드(① UTF-8 BOM ② UTF-8 ③ CP949/EUC-KR),
//     BOM 은 제거. xlsx 는 셀 텍스트 그대로.
//   - 원본 보존: 각 행의 원본 셀 문자열을 그대로 raw 로 반환(가공 없음).
import ExcelJS from "exceljs";

export type FileType = "xlsx" | "csv" | "txt";

export interface ChatRow {
  rowIndex: number; // 데이터 행 순서(0-base, 헤더 제외)
  date_raw: string;
  user_raw: string;
  message_raw: string;
  date_value: Date | null; // 파싱 성공 시 시각
  raw: Record<string, string>; // 원본 행 전체(헤더→값)
}

export interface ParsedFile {
  fileType: FileType;
  headers: string[];
  rows: ChatRow[];
}

const ALIASES: Record<"date" | "user" | "message", string[]> = {
  date: ["date", "datetime", "date_time", "일시", "날짜", "time", "시간", "timestamp"],
  user: ["user", "username", "user_name", "name", "이름", "보낸사람", "발신자", "작성자", "sender"],
  message: ["message", "msg", "content", "text", "내용", "메시지", "메세지", "본문"],
};

function norm(h: string): string {
  return h.toLowerCase().replace(/[\s_\-]/g, "").trim();
}

function findCol(headers: string[], key: "date" | "user" | "message"): number {
  const targets = ALIASES[key].map(norm);
  return headers.findIndex((h) => targets.includes(norm(h)));
}

export function fileTypeFromName(name: string): FileType | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv") return "csv";
  if (ext === "txt") return "txt";
  return null;
}

// 엑셀 날짜(직렬값 또는 Date) / 문자열 → Date | null
function toDate(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    // 엑셀 직렬일(1900 기준)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const o = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.result != null) return String(o.result);
    return JSON.stringify(value);
  }
  return String(value);
}

// ── 텍스트 인코딩 자동 판별 → 디코드 (CSV·카카오 .txt 공용) ────────────
//   카카오 상담톡/채널톡 원본, 엑셀 CSV 저장본, 카카오톡 .txt 내보내기가
//   제각각이라 인코딩을 추정한다.
//   우선순위: ① UTF-8 BOM → ② UTF-8(엄격 검증) → ③ CP949(EUC-KR)
//   ICU 의 "euc-kr" 디코더는 windows-949(UHC)로, EUC-KR 의 슈퍼셋인 CP949 까지 처리한다.
function decodeText(buf: Buffer): string {
  // ① UTF-8 BOM(EF BB BF): 명시적 UTF-8. BOM 은 parseCsv 가 제거.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf);
  }
  // ② UTF-8: 엄격(fatal) 디코더로 검증 — 유효하면 UTF-8 로 확정.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // ③ CP949(EUC-KR): UTF-8 로 깨지는 한글 바이트열 → 한국어 레거시 인코딩으로 폴백.
    return new TextDecoder("euc-kr").decode(buf);
  }
}

// ── CSV/TSV 파서 (따옴표/개행 처리, BOM 제거) ────────────────────────
//   delim 으로 구분자(콤마/탭)를 지정. 따옴표 안의 구분자·개행은 필드 일부로 보존.
function parseCsv(text: string, delim = ","): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM 제거
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 완전 빈 행 제거
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function readXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // @types/node 의 Buffer 제네릭과 exceljs 시그니처 차이를 우회
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (excelRow) => {
    const vals = excelRow.values as unknown[]; // 1-base 배열([0] 비움)
    const cells: string[] = [];
    for (let i = 1; i < vals.length; i++) cells.push(cellText(vals[i]));
    out.push(cells);
  });
  return out;
}

// ── 카카오톡 .txt 내보내기 파서 (오픈채팅/일반 대화) ───────────────────
//   카카오톡 "대화 내보내기"가 만드는 평문 .txt 를 (date, user, message) 행으로 환원한다.
//   지원 포맷(자동 인식):
//     · PC          : [이름] [오후 2:30] 메시지   (+ 날짜 구분선: "--------------- 2024년 1월 15일 월요일 ---------------")
//     · 안드로이드   : 2024년 1월 15일 오후 2:30, 이름 : 메시지
//     · iOS         : 2024. 1. 15. 오후 2:30, 이름 : 메시지
//   여러 줄 메시지는 다음 메시지/날짜선이 나오기 전까지의 줄을 직전 메시지에 이어붙인다.
//   머리말("…님과 카카오톡 대화", "저장한 날짜 …")·시스템 안내는 매칭되는 메시지가 없으면 무시된다.
const RE_PC_DATE = /^-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?-{3,}\s*$/;
const RE_PC_MSG = /^\[([^\]]+)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s*([\s\S]*)$/;
const RE_AOS_MSG =
  /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*([\s\S]*)$/;
const RE_IOS_MSG =
  /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*([\s\S]*)$/;
// 오픈채팅방 입장/퇴장 등 카카오톡 시스템 안내 — 메시지가 아니므로 학습에서 제외(이어붙이지 않음).
const RE_SYSTEM =
  /(님이 들어왔습니다|님이 나갔습니다|님을 내보냈습니다|님을 초대했습니다|채팅방 관리자|운영정책)/;

function makeDate(
  y: number, mo: number, d: number, ampm: string, h: number, mi: number,
): Date | null {
  let hour = h % 12;
  if (ampm === "오후") hour += 12;
  const date = new Date(y, mo - 1, d, hour, mi);
  return isNaN(date.getTime()) ? null : date;
}

function parseKakaoTxt(text: string): ParsedFile {
  const headers = ["date", "user", "message"];
  const rows: ChatRow[] = [];
  let curDate: { y: number; mo: number; d: number } | null = null;

  const push = (date_value: Date | null, date_raw: string, user: string, msg: string) => {
    rows.push({
      rowIndex: rows.length,
      date_raw,
      user_raw: user,
      message_raw: msg,
      date_value,
      raw: { date: date_raw, user, message: msg },
    });
  };

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/ /g, " "); // NBSP → 일반 공백
    const trimmed = line.trim();

    // PC 날짜 구분선 → 이후 메시지의 날짜 기준
    const dm = trimmed.match(RE_PC_DATE);
    if (dm) {
      curDate = { y: +dm[1], mo: +dm[2], d: +dm[3] };
      continue;
    }

    // 안드로이드/iOS: 한 줄에 날짜·시각·이름·메시지 전부
    const am = trimmed.match(RE_AOS_MSG) ?? trimmed.match(RE_IOS_MSG);
    if (am) {
      const [, y, mo, d, ampm, h, mi, user, msg] = am;
      push(makeDate(+y, +mo, +d, ampm, +h, +mi), `${y}-${mo}-${d} ${ampm} ${h}:${mi}`, user.trim(), msg);
      continue;
    }

    // PC: 이름·시각 + (직전 날짜선의 날짜)
    const pm = trimmed.match(RE_PC_MSG);
    if (pm) {
      const [, user, ampm, h, mi, msg] = pm;
      const dv = curDate ? makeDate(curDate.y, curDate.mo, curDate.d, ampm, +h, +mi) : null;
      const dateRaw = curDate
        ? `${curDate.y}-${curDate.mo}-${curDate.d} ${ampm} ${h}:${mi}`
        : `${ampm} ${h}:${mi}`;
      push(dv, dateRaw, user.trim(), msg);
      continue;
    }

    // 입장/퇴장 등 시스템 안내는 메시지가 아니므로 건너뜀(이어붙이지 않음).
    if (RE_SYSTEM.test(trimmed)) continue;

    // 어디에도 안 맞는 줄: 직전 메시지의 다음 줄(여러 줄 메시지)로 이어붙임.
    // 직전 메시지가 없으면 머리말으로 보고 무시.
    if (rows.length > 0 && trimmed !== "") {
      const last = rows[rows.length - 1];
      last.message_raw += `\n${line}`;
      last.raw.message = last.message_raw;
    }
  }

  if (rows.length === 0) {
    throw new Error(
      "카카오톡 대화 형식을 인식하지 못했습니다. 카카오톡 '대화 내보내기'로 저장한 .txt 인지 확인해 주세요.",
    );
  }
  return { fileType: "txt", headers, rows };
}

// .txt 가 카카오톡 평문이 아니라 DATE/USER/MESSAGE 표(상담툴 내보내기 등)인 경우를 감지.
//   첫 줄을 탭→콤마 순으로 분해해 필수 3컬럼이 모두 잡히면 그 구분자를 돌려준다(아니면 null).
function detectDelimitedHeader(text: string): "\t" | "," | null {
  let head = text;
  if (head.charCodeAt(0) === 0xfeff) head = head.slice(1); // BOM 제거 후 첫 줄만 검사
  const firstLine = head.split(/\r\n|\r|\n/, 1)[0] ?? "";
  for (const delim of ["\t", ","] as const) {
    const cols = firstLine.split(delim).map((h) => h.trim());
    if (
      cols.length >= 2 &&
      findCol(cols, "date") >= 0 &&
      findCol(cols, "user") >= 0 &&
      findCol(cols, "message") >= 0
    ) {
      return delim;
    }
  }
  return null;
}

// 표 형식(matrix) → ParsedFile. xlsx/csv 및 표로 저장된 .txt 공용.
function matrixToParsed(matrix: string[][], fileType: FileType): ParsedFile {
  if (matrix.length === 0) throw new Error("빈 파일입니다.");

  const headers = matrix[0].map((h) => h.trim());
  const di = findCol(headers, "date");
  const ui = findCol(headers, "user");
  const mi = findCol(headers, "message");
  if (di < 0 || ui < 0 || mi < 0) {
    const missing = [di < 0 && "DATE", ui < 0 && "USER", mi < 0 && "MESSAGE"]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `필수 컬럼이 없습니다: ${missing}. (파일 헤더: ${headers.join(", ") || "없음"})`,
    );
  }

  const rows: ChatRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    const date_raw = (cells[di] ?? "").trim();
    const user_raw = (cells[ui] ?? "").trim();
    const message_raw = cells[mi] ?? ""; // 메시지는 원문 보존(trim 안 함)
    // 원본 행 전체 보존
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h || `col${idx}`] = cells[idx] ?? "";
    });
    rows.push({
      rowIndex: r - 1,
      date_raw,
      user_raw,
      message_raw,
      date_value: toDate(date_raw),
      raw,
    });
  }

  return { fileType, headers, rows };
}

export async function parseChatlogFile(
  buf: Buffer,
  filename: string,
): Promise<ParsedFile> {
  const fileType = fileTypeFromName(filename);
  if (!fileType) {
    throw new Error("지원하지 않는 형식입니다. .xlsx · .csv(UTF-8/CP949) · .txt(카카오톡) 파일을 올려주세요.");
  }

  if (fileType === "txt") {
    const text = decodeText(buf);
    // DATE/USER/MESSAGE 표(.txt)면 표로, 아니면 카카오톡 평문으로 파싱.
    const delim = detectDelimitedHeader(text);
    return delim ? matrixToParsed(parseCsv(text, delim), "txt") : parseKakaoTxt(text);
  }

  const matrix =
    fileType === "csv" ? parseCsv(decodeText(buf)) : await readXlsx(buf);
  return matrixToParsed(matrix, fileType);
}
