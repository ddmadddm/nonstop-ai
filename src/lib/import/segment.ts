// 대형 카카오톡 채팅방 → 상담 단위(세그먼트) 자동 분리 — 결정적(규칙 기반) 전처리.
//   하나의 채팅방(conversation)에는 수개월치 수백 건의 상담이 섞여 있다. 단일 추출은
//   의미가 없으므로, 먼저 값싼 규칙으로 상담 경계를 나눈 뒤(여기), 세그먼트별로 AI 추출/매칭한다.
//   (전체 설계: docs/13-large-chat-segmentation.md)
//
//   분리 기준(요구사항):
//     1) 접수방법 메시지(주문 접수)            → INTAKE
//     2) 출발지/도착지/물품/차종/결제 키워드   → ORDER
//     3) 배차정보 메시지(기사 배정 = 상담 종료)→ DISPATCH (다음 메시지부터 새 상담)
//     4) 일정 시간 이상 대화 공백              → GAP
//     5) 거래처명/담당자명 변경                → SENDER
//
//   AI 비용 없이 동작하는 순수 함수. 애매한 경계는 이후 AI로 보정(설계 문서 참고).

export interface SegMessage {
  seq: number;
  senderType: "staff" | "customer" | string;
  senderName: string | null;
  content: string;
  sentAt: Date | null;
}

export type SegTrigger = "intake" | "order" | "dispatch" | "gap" | "sender" | "start";

export interface Segment {
  index: number; // 0-base 순번
  startSeq: number; // 포함 시작 메시지 seq
  endSeq: number; // 포함 끝 메시지 seq
  messageCount: number;
  startedAt: Date | null;
  endedAt: Date | null;
  triggers: SegTrigger[]; // 이 세그먼트가 '시작'된 이유
  // 세그먼트 내부에서 감지된 신호(추출/매칭 힌트로 사용)
  signals: { intake: boolean; order: boolean; dispatch: boolean };
  clientHint: string | null; // 대표 고객(거래처/담당자 추정) 발화자명
}

export interface SegmentOptions {
  gapMinutes?: number; // 대화 공백 경계 임계(분). 기본 120.
  minMessages?: number; // 이보다 짧은 세그먼트는 이전 세그먼트로 병합. 기본 2.
}

// ── 규칙 키워드 ───────────────────────────────────────────────────────
// 1) 접수방법(주문 접수) — 새 상담의 시작 신호
const RE_INTAKE = /접수|퀵\s*요청|요청\s*드립|요청\s*합니다|요청\s*해|주문|오더|보내\s*주세요|보내드/;
// 2) 주문 상세 키워드 — 출발/도착/물품/차종/결제
const RE_ORDER = new RegExp(
  [
    "출발", "도착", "상차", "하차", "에서.{0,8}까지", "→", "▶",
    "물품", "박스", "파렛트|파레트|파레뜨", "화물", "짐",
    "다마스", "라보", "오토바이|오토", "1\\s*톤|1톤", "탑차", "카고", "트럭",
    "착불", "선불", "현금", "카드", "계좌", "세금계산서", "월말|정산",
  ].join("|"),
);
// 3) 배차정보(기사 배정) — 상담 종료 신호. 직원 발화에서 주로 등장.
const RE_DISPATCH = /배차\s*정보|배차\s*완료|배차\s*드림|배차\s*해|배차\s*됐|기사님|기사\s*성함|차량\s*번호/;
const RE_PHONE = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/;
const RE_PLATE = /\d{2,3}\s*[가-힣]\s*\d{4}/; // 12가3456 형태(차량번호)

function minutesBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.abs(b.getTime() - a.getTime()) / 60000;
}

function detect(content: string, senderType: string) {
  const text = content ?? "";
  const intake = RE_INTAKE.test(text);
  const order = RE_ORDER.test(text);
  // 배차정보는 직원 발화 + (배차 키워드) + (전화/차량번호 동반) 일 때 신뢰. 명시적 '배차정보'는 단독 인정.
  const dispatchWord = RE_DISPATCH.test(text);
  const dispatch =
    senderType === "staff" &&
    (/배차\s*정보/.test(text) || (dispatchWord && (RE_PHONE.test(text) || RE_PLATE.test(text))));
  return { intake, order, dispatch };
}

/**
 * 채팅 메시지(시간순)를 상담 단위로 분리한다.
 * 경계 우선순위: 큰 시간공백 · 직전 배차완료 · 발화자(거래처) 변경 · 배차 이후의 새 접수.
 */
export function segmentChatMessages(
  messages: SegMessage[],
  opts: SegmentOptions = {},
): Segment[] {
  const gapMinutes = opts.gapMinutes ?? 120;
  const minMessages = opts.minMessages ?? 2;
  if (messages.length === 0) return [];

  // 1) 경계 탐지 → 세그먼트 누적 (현재 열린 세그먼트는 segs[curIdx])
  const segs: Segment[] = [];
  let curIdx = -1;
  let curCustomer: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const d = detect(m.content, m.senderType);
    const isCustomer = m.senderType !== "staff";
    const name = isCustomer ? (m.senderName?.trim() || null) : null;

    // 경계 신호 평가(현재 세그먼트가 열려 있을 때만)
    // 경계 신호 평가. 배차정보(상담 종료)는 '직전 메시지' 기준으로만 경계를 만든다 →
    //   배차 메시지 자체는 직전 상담에 포함되고, 그 다음 메시지부터 새 상담이 시작된다.
    //   주문 키워드(rule2)는 단독 경계가 아니라 세그먼트 신호 + 새 접수의 전제로만 쓴다(과분할 방지).
    const triggers: SegTrigger[] = [];
    if (curIdx >= 0) {
      const c = segs[curIdx];
      // (4) 시간 공백
      if (prev && minutesBetween(prev.sentAt, m.sentAt) >= gapMinutes) triggers.push("gap");
      // (3) 직전 메시지가 배차완료 → 새 상담 시작
      if (prev && detect(prev.content, prev.senderType).dispatch) triggers.push("dispatch");
      // (5) 거래처/담당자(발화자) 변경
      if (name && curCustomer && name !== curCustomer) triggers.push("sender");
      // (1) 고객의 '접수' 메시지인데 현재 세그먼트가 이미 주문/배차를 거친 경우 = 새 상담
      if (
        triggers.length === 0 &&
        isCustomer &&
        d.intake &&
        (c.signals.dispatch || c.signals.order)
      ) {
        triggers.push("intake");
      }
    }

    if (curIdx < 0 || triggers.length > 0) {
      segs.push({
        index: segs.length,
        startSeq: m.seq,
        endSeq: m.seq,
        messageCount: 0,
        startedAt: m.sentAt,
        endedAt: m.sentAt,
        triggers: curIdx < 0 ? ["start"] : triggers,
        signals: { intake: false, order: false, dispatch: false },
        clientHint: null,
      });
      curIdx = segs.length - 1;
      if (isCustomer && name) curCustomer = name;
    }

    // 현재 세그먼트 갱신
    const c = segs[curIdx];
    c.endSeq = m.seq;
    c.endedAt = m.sentAt ?? c.endedAt;
    c.messageCount += 1;
    if (d.intake) c.signals.intake = true;
    if (d.order) c.signals.order = true;
    if (d.dispatch) c.signals.dispatch = true;
    if (isCustomer && name) {
      curCustomer = name;
      if (!c.clientHint) c.clientHint = name;
    }
  }

  // 2) 주문 내용이 없는 잡담 세그먼트(사진/감사합니다 등)나 너무 짧은 조각은 이전 상담으로 병합.
  //    접수·주문·배차 신호가 하나라도 있으면 독립 상담으로 유지한다.
  const merged: Segment[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    const contentless = !s.signals.intake && !s.signals.order && !s.signals.dispatch;
    const tinyNonOrder = s.messageCount < minMessages && !s.signals.intake && !s.signals.order;
    if (last && (contentless || tinyNonOrder)) {
      last.endSeq = s.endSeq;
      last.endedAt = s.endedAt ?? last.endedAt;
      last.messageCount += s.messageCount;
      last.signals.intake ||= s.signals.intake;
      last.signals.order ||= s.signals.order;
      last.signals.dispatch ||= s.signals.dispatch;
    } else {
      merged.push({ ...s, index: merged.length });
    }
  }
  return merged;
}
