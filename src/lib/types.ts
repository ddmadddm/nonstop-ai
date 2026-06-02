// NONSTOP-AI 도메인 타입
// 업무: 퀵/화물 배차 중개 (docs/08-domain-model.md 참고)

export type Role = "reception" | "dispatch" | "admin";

export const ROLE_LABEL: Record<Role, string> = {
  reception: "접수팀",
  dispatch: "배차팀",
  admin: "관리자",
};

export type VehicleType = "오토바이" | "다마스" | "라보" | "1톤" | "기타";

export interface Agent {
  id: string;
  name: string;
  role: Role;
}

export interface Client {
  id: string;
  name: string;
  businessNo?: string;
  phone?: string;
  memo?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleNo?: string;
  vehicleType: VehicleType;
}

export interface Category {
  key: string;
  parentKey: string | null;
  name: string;
  description: string;
}

export interface Faq {
  id: string;
  categoryKey: string;
  question: string;
  answer: string;
  keywords: string[];
  updatedAt: string;
}

export type ConversationStatus = "open" | "pending" | "closed";
export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "진행중",
  pending: "대기",
  closed: "완료",
};

export type SenderType = "customer" | "agent" | "ai" | "system";

export interface Attachment {
  kind: "map" | "image" | "file";
  label?: string;
}

export interface Message {
  id: string;
  sender: SenderType;
  agentName?: string;
  text: string;
  attachments?: Attachment[];
  sentAt: string; // ISO
}

export type StopType = "pickup" | "via" | "dropoff";

export interface OrderStop {
  seq: number;
  type: StopType;
  name?: string; // 상호
  address: string;
  phone?: string;
  qty?: string; // 수량(예: 11박스)
}

export type DispatchStatus =
  | "배차중"
  | "배차완료"
  | "재배차"
  | "운행"
  | "완료"
  | "취소";

export interface Dispatch {
  driverName: string;
  driverPhone: string;
  vehicleNo?: string;
  vehicleType: VehicleType;
  fare?: number; // 운임(공급가)
  status: DispatchStatus;
}

export type RequestType = "즉시" | "시간지정";

export interface Order {
  requestType: RequestType;
  desiredTime?: string;
  stops: OrderStop[];
  item?: string; // 물품
  vehicleType: VehicleType;
  note?: string; // 특이사항
  viaOrderFixed?: boolean; // 경유 순서 지정 여부 (false = 코스 자유)
}

export type AiDraftStatus = "draft" | "accepted" | "edited" | "discarded";

export interface AiDraft {
  text: string;
  usedFaqIds: string[];
  confidence: number; // 0~1
  status: AiDraftStatus;
}

export interface Conversation {
  id: string;
  title: string; // 예: "하림신선/김병준님"
  clientId: string;
  contactName: string;
  categoryKey: string;
  status: ConversationStatus;
  assignedAgent?: string;
  channel: "kakao";
  messages: Message[];
  order?: Order;
  dispatch?: Dispatch;
  aiDraft?: AiDraft;
  createdAt: string;
  lastMessageAt: string;
}

export interface DashboardStats {
  todayCount: number;
  openCount: number;
  pendingCount: number;
  closedCount: number;
  byCategory: { key: string; name: string; count: number }[];
}
