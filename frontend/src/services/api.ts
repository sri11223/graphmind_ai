import type { GraphData, NodeDetail, ChatApiResponse, GraphStats } from "../types";

const BASE = "/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getGraphData(): Promise<GraphData> {
  return fetchJson<GraphData>(`${BASE}/graph/data`);
}

export async function getNodeDetail(nodeId: string): Promise<NodeDetail> {
  return fetchJson<NodeDetail>(`${BASE}/graph/node/${encodeURIComponent(nodeId)}`);
}

export async function searchNodes(query: string): Promise<{ id: string; type: string; label: string; color: string }[]> {
  return fetchJson(`${BASE}/graph/search?q=${encodeURIComponent(query)}`);
}

export async function getGraphStats(): Promise<GraphStats> {
  return fetchJson<GraphStats>(`${BASE}/graph/stats`);
}

export async function sendChatMessage(
  message: string,
  history: { role: string; content: string }[]
): Promise<ChatApiResponse> {
  return fetchJson<ChatApiResponse>(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
}

export interface Suggestion {
  text: string;
  category: string;
}

export async function getSuggestions(): Promise<Suggestion[]> {
  return fetchJson<Suggestion[]>(`${BASE}/chat/suggestions`);
}
