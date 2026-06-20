// 데이터 접근 계층 (Data Access Layer)
// 지금은 목업(mock)에서 읽지만, Supabase 연동 시 이 함수들의 구현만 교체하면 된다.
// 화면 코드는 이 인터페이스에만 의존하도록 유지한다.
import { CATEGORIES, categoryName, topCategoryKey } from "@/lib/categories";
import type {
  Client,
  Conversation,
  DashboardStats,
  Driver,
  Faq,
} from "@/lib/types";
import { getConsultations } from "@/lib/db/consultations";
import type { Consultation } from "@/lib/db/consultations";
import { agents, clients, conversations, drivers, faqs } from "./mock";

function sortByRecent(a: Conversation, b: Conversation) {
  return b.lastMessageAt.localeCompare(a.lastMessageAt);
}

// 업로드된 상담자료(consultations)를 상담관리 목록에 함께 보여주기 위한 변환.
// 원문은 그대로 단일 메시지로 보존한다.
function consultationToConversation(c: Consultation): Conversation {
  const title =
    [c.client_name, c.manager_name].filter(Boolean).join("/") ||
    "업로드 상담자료";
  return {
    id: `up_${c.id}`,
    title,
    clientId: "",
    contactName: c.manager_name ?? "",
    categoryKey: c.consultation_type ?? "기타",
    status: "open",
    assignedAgent: c.created_by,
    channel: "kakao",
    messages: c.consultation_content_original
      ? [
          {
            id: "m1",
            sender: "customer",
            text: c.consultation_content_original,
            sentAt: c.created_at,
          },
        ]
      : [],
    createdAt: c.created_at,
    lastMessageAt: c.created_at,
  };
}

export async function getAgents() {
  return agents;
}

export async function getConversations(filter?: {
  status?: string;
  clientId?: string;
  categoryTop?: string;
}): Promise<Conversation[]> {
  const uploaded = (await getConsultations()).map(consultationToConversation);
  let list = [...uploaded, ...conversations];
  if (filter?.status) list = list.filter((c) => c.status === filter.status);
  if (filter?.clientId) list = list.filter((c) => c.clientId === filter.clientId);
  if (filter?.categoryTop)
    list = list.filter((c) => topCategoryKey(c.categoryKey) === filter.categoryTop);
  return list.sort(sortByRecent);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return conversations.find((c) => c.id === id) ?? null;
}

export async function getClients(): Promise<Client[]> {
  return clients;
}

export async function getClient(id: string): Promise<Client | null> {
  return clients.find((c) => c.id === id) ?? null;
}

export async function getClientConversations(clientId: string) {
  return conversations.filter((c) => c.clientId === clientId).sort(sortByRecent);
}

export async function getDrivers(): Promise<Driver[]> {
  return drivers;
}

export async function getFaqs(): Promise<Faq[]> {
  return [...faqs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getFaqsByIds(ids: string[]): Promise<Faq[]> {
  return faqs.filter((f) => ids.includes(f.id));
}

export interface SearchHit {
  conversationId: string;
  title: string;
  snippet: string;
  categoryKey: string;
  sentAt: string;
}

export async function search(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const cv of conversations) {
    for (const m of cv.messages) {
      if (m.text.includes(q)) {
        const idx = m.text.indexOf(q);
        const start = Math.max(0, idx - 20);
        const snippet =
          (start > 0 ? "…" : "") + m.text.slice(start, idx + q.length + 30).replace(/\n/g, " ");
        hits.push({
          conversationId: cv.id,
          title: cv.title,
          snippet,
          categoryKey: cv.categoryKey,
          sentAt: m.sentAt,
        });
      }
    }
  }
  return hits.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export async function getStats(): Promise<DashboardStats> {
  const today = "2026-06-02"; // 목업 기준일 (실제로는 오늘 날짜)
  const todayCount = conversations.filter((c) =>
    c.lastMessageAt.startsWith(today),
  ).length;

  const counts = new Map<string, number>();
  for (const c of conversations) {
    const top = topCategoryKey(c.categoryKey);
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  const byCategory = CATEGORIES.filter((c) => c.parentKey === null)
    .map((c) => ({ key: c.key, name: c.name, count: counts.get(c.key) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    todayCount,
    openCount: conversations.filter((c) => c.status === "open").length,
    pendingCount: conversations.filter((c) => c.status === "pending").length,
    closedCount: conversations.filter((c) => c.status === "closed").length,
    byCategory,
  };
}

export { categoryName };
