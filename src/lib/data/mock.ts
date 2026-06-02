// 목업 데이터 — 실제 채널톡 상담 스크린샷(2026-06-02) 기반.
// Supabase 연동 시 이 파일 대신 DB에서 같은 형태로 읽어오면 된다.
import type {
  Agent,
  Client,
  Conversation,
  Driver,
  Faq,
} from "@/lib/types";

export const agents: Agent[] = [
  { id: "a1", name: "정태신", role: "dispatch" },
  { id: "a2", name: "오현미", role: "dispatch" },
  { id: "a3", name: "방미라", role: "reception" },
  { id: "a0", name: "관리자", role: "admin" },
];

export const clients: Client[] = [
  { id: "c1", name: "하림", businessNo: "123-45-67890", phone: "010-3935-2380", memo: "신선식품 운송 다수. 다마스 위주." },
  { id: "c2", name: "리씽크", businessNo: "211-88-12345", phone: "010-0000-0000", memo: "오토바이 퀵 위주." },
];

export const drivers: Driver[] = [
  { id: "d1", name: "김광석", phone: "010-3901-3272", vehicleNo: "서울성동파7520", vehicleType: "오토바이" },
  { id: "d2", name: "길석우", phone: "010-0000-8028", vehicleType: "오토바이" },
  { id: "d3", name: "이성태", phone: "010-6435-3742", vehicleNo: "서울91자2960", vehicleType: "오토바이" },
  { id: "d4", name: "김장하", phone: "010-3936-2799", vehicleNo: "경기고양더0651", vehicleType: "다마스" },
];

export const faqs: Faq[] = [
  { id: "f1", categoryKey: "order_new", question: "퀵 요청은 어떻게 보내나요?", answer: "출발지(상호·주소·연락처), 도착지/경유지(상호·주소·연락처·수량), 물품, 차량종류, 희망시간을 보내주시면 접수 후 배차 진행하겠습니다.", keywords: ["퀵요청", "접수", "오더"], updatedAt: "2026-06-01" },
  { id: "f2", categoryKey: "order_confirm", question: "경유 순서는 상관없나요?", answer: "경유 순서 지정이 없으시면 기사님이 효율적인 코스로 진행합니다. 순서 지정이 필요하면 알려주세요.", keywords: ["경유순서", "코스", "순서"], updatedAt: "2026-06-02" },
  { id: "f3", categoryKey: "order_time", question: "즉시 배차 가능한가요?", answer: "차량 상황에 따라 즉시 배차 가능합니다. 출발지·차량종류를 알려주시면 가능 여부를 바로 확인해 안내드리겠습니다.", keywords: ["즉시", "바로", "지금"], updatedAt: "2026-06-01" },
  { id: "f4", categoryKey: "dispatch_vehicle", question: "다마스로 가능한가요?", answer: "물품 수량·크기를 알려주시면 다마스/라보/오토/1톤 중 적합한 차량으로 배차해 드리겠습니다.", keywords: ["다마스", "라보", "차종"], updatedAt: "2026-06-01" },
  { id: "f5", categoryKey: "dispatch_redispatch", question: "배차된 기사님이 취소됐다는데요?", answer: "불편을 드려 죄송합니다. 해당 기사님 사정으로 재배차 진행 중이며, 새 기사 배정되는 대로 즉시 안내드리겠습니다.", keywords: ["재배차", "취소", "기사이탈"], updatedAt: "2026-06-02" },
  { id: "f6", categoryKey: "fare_inquiry", question: "운임이 얼마인가요?", answer: "출발지·도착지·경유 수·차량종류·물품에 따라 운임이 산정됩니다. 정보를 주시면 운임을 안내드리겠습니다.", keywords: ["운임", "요금", "견적"], updatedAt: "2026-06-01" },
  { id: "f7", categoryKey: "transit_location", question: "기사님 지금 어디쯤인가요?", answer: "기사님 현재 위치를 확인해 안내드리겠습니다. 잠시만 기다려 주세요.", keywords: ["위치", "어디", "현황"], updatedAt: "2026-06-01" },
];

export const conversations: Conversation[] = [
  {
    id: "cv1",
    title: "하림신선/김병준님",
    clientId: "c1",
    contactName: "김병준",
    categoryKey: "dispatch_redispatch",
    status: "open",
    assignedAgent: "오현미",
    channel: "kakao",
    createdAt: "2026-06-02T09:50:00+09:00",
    lastMessageAt: "2026-06-02T10:40:00+09:00",
    messages: [
      { id: "m1", sender: "customer", text: "[지도] 기사 출발지까지 10.317Km, [출]하림", attachments: [{ kind: "map", label: "기사 위치 지도" }], sentAt: "2026-06-02T10:08:00+09:00" },
      { id: "m2", sender: "agent", agentName: "정태신", text: "위 기사님도 동일하게 다마스운임으로 오토바이 기사님 진행하십니다", sentAt: "2026-06-02T10:09:00+09:00" },
      { id: "m3", sender: "agent", agentName: "오현미", text: "고객님 길석우 기사님 빠지셔서 재배차 중입니다.", sentAt: "2026-06-02T10:18:00+09:00" },
      { id: "m4", sender: "agent", agentName: "오현미", text: "배차정보\n삼평동▶송파신천동(2명)\n김광석\n010-3901-3272\n서울성동파7520\n오토", sentAt: "2026-06-02T10:30:00+09:00" },
      { id: "m5", sender: "customer", text: "[지도] 기사 0.143Km, [출]하림", attachments: [{ kind: "map", label: "기사 위치 지도" }], sentAt: "2026-06-02T10:40:00+09:00" },
    ],
    order: {
      requestType: "즉시",
      vehicleType: "오토바이",
      stops: [
        { seq: 1, type: "pickup", name: "하림", address: "성남시 분당구 삼평동" },
        { seq: 2, type: "dropoff", address: "송파구 신천동", qty: "2명" },
      ],
    },
    dispatch: {
      driverName: "김광석",
      driverPhone: "010-3901-3272",
      vehicleNo: "서울성동파7520",
      vehicleType: "오토바이",
      status: "재배차",
    },
    aiDraft: {
      text: "고객님, 기존 길석우 기사님 사정으로 재배차 진행했습니다.\n\n배차정보\n삼평동▶송파신천동(2명)\n김광석 / 010-3901-3272\n서울성동파7520 / 오토\n\n기사님 곧 상차지 도착 예정이며 진행 상황 안내드리겠습니다.",
      usedFaqIds: ["f5"],
      confidence: 0.82,
      status: "draft",
    },
  },
  {
    id: "cv2",
    title: "하림/조용호님",
    clientId: "c1",
    contactName: "조용호",
    categoryKey: "order_multi",
    status: "pending",
    assignedAgent: "방미라",
    channel: "kakao",
    createdAt: "2026-06-02T10:30:00+09:00",
    lastMessageAt: "2026-06-02T10:39:00+09:00",
    messages: [
      { id: "m1", sender: "customer", text: "퀵요청드립니다. 경유 3곳 / 즉시입차가능. 하차지 매장안에 넣어주세요!\n\n하림 서부지점 조용호 (010-3935-2380)\n\n출발지\n일승푸드 제2공장\n경기도 용인시 기흥구 지삼로 116\n010-3209-4004\n\n도착지(경유1) 11박스\n대전 동구 계족로 429 장수통닭\n010-9401-3754\n\n도착지(경유2) 1박스\n대전시 유성구 엑스포로 151번길 19 5.5 닭갈비 도룡점\n010-3332-6854\n\n도착지(경유3) 2박스\n대전광역시 대덕구 선비마을로 20 가마치통닭\n010-4465-6633\n\n물품 : 종이박스 총 14개(닭 부분육)\n차량 : 다마스\n\n배차 시 배차정보, 금액 제 폰번호로도 부탁드립니다", sentAt: "2026-06-02T10:34:00+09:00" },
      { id: "m2", sender: "agent", agentName: "방미라", text: "감사합니다", sentAt: "2026-06-02T10:34:00+09:00" },
      { id: "m3", sender: "agent", agentName: "방미라", text: "경유 순서는 상관없는 걸까요?", sentAt: "2026-06-02T10:39:00+09:00" },
      { id: "m4", sender: "customer", text: "상관없습니다 코스는 편하게 잡아주시면됩니다 !", sentAt: "2026-06-02T10:39:00+09:00" },
      { id: "m5", sender: "agent", agentName: "방미라", text: "넵", sentAt: "2026-06-02T10:39:30+09:00" },
    ],
    order: {
      requestType: "즉시",
      vehicleType: "다마스",
      item: "종이박스 총 14개(닭 부분육)",
      note: "하차지 매장 안에 넣어주세요. 배차정보·금액 담당자 폰번호로도 전달.",
      viaOrderFixed: false,
      stops: [
        { seq: 1, type: "pickup", name: "일승푸드 제2공장", address: "경기도 용인시 기흥구 지삼로 116", phone: "010-3209-4004" },
        { seq: 2, type: "via", name: "장수통닭", address: "대전 동구 계족로 429", phone: "010-9401-3754", qty: "11박스" },
        { seq: 3, type: "via", name: "닭갈비 도룡점", address: "대전시 유성구 엑스포로 151번길 19 5.5", phone: "010-3332-6854", qty: "1박스" },
        { seq: 4, type: "dropoff", name: "가마치통닭", address: "대전광역시 대덕구 선비마을로 20", phone: "010-4465-6633", qty: "2박스" },
      ],
    },
    aiDraft: {
      text: "요청 주신 내용 접수했습니다. 경유 순서는 지정 없으셔서 기사님이 효율적인 코스로 진행하겠습니다.\n\n· 출발: 일승푸드 제2공장(용인 기흥)\n· 경유/도착: 장수통닭 11박스 → 닭갈비 도룡점 1박스 → 가마치통닭 2박스 (대전)\n· 물품: 종이박스 14개(닭 부분육) / 차량: 다마스\n· 하차지 매장 안 배치 요청 확인했습니다.\n\n배차되는 대로 배차정보·금액을 담당자 번호로도 함께 전달드리겠습니다.",
      usedFaqIds: ["f2", "f4"],
      confidence: 0.9,
      status: "draft",
    },
  },
  {
    id: "cv3",
    title: "리씽크/오세란님",
    clientId: "c2",
    contactName: "오세란",
    categoryKey: "fare_notice",
    status: "closed",
    assignedAgent: "오현미",
    channel: "kakao",
    createdAt: "2026-06-02T10:20:00+09:00",
    lastMessageAt: "2026-06-02T10:38:00+09:00",
    messages: [
      { id: "m1", sender: "agent", agentName: "오현미", text: "감사합니다", sentAt: "2026-06-02T10:24:00+09:00" },
      { id: "m2", sender: "agent", agentName: "오현미", text: "배차정보\n일산설문동▶구로개봉동\n이성태\n010-6435-3742\n서울91자2960", sentAt: "2026-06-02T10:35:00+09:00" },
      { id: "m3", sender: "agent", agentName: "오현미", text: "운임 40,000원(공급가)입니다", sentAt: "2026-06-02T10:36:00+09:00" },
      { id: "m4", sender: "customer", text: "넵넵", sentAt: "2026-06-02T10:36:30+09:00" },
      { id: "m5", sender: "agent", agentName: "오현미", text: "배차정보\n11시/일산문봉동▶팟빵-마포서교동\n김장하\n010-3936-2799\n경기고양더0651\n25,000원(공급가)", sentAt: "2026-06-02T10:38:00+09:00" },
    ],
    order: {
      requestType: "즉시",
      vehicleType: "오토바이",
      stops: [
        { seq: 1, type: "pickup", address: "일산 설문동" },
        { seq: 2, type: "dropoff", address: "구로 개봉동" },
      ],
    },
    dispatch: {
      driverName: "이성태",
      driverPhone: "010-6435-3742",
      vehicleNo: "서울91자2960",
      vehicleType: "오토바이",
      fare: 40000,
      status: "배차완료",
    },
  },
];
