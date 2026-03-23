import type { GraphData, NodeDetail, ChatApiResponse, GraphStats, AnalyticsData, PathResult } from "../types";

const BASE = (import.meta.env.VITE_API_URL || "") + "/api";

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

export async function getAnalytics(): Promise<AnalyticsData> {
  return fetchJson<AnalyticsData>(`${BASE}/graph/analytics`);
}

export async function findPath(source: string, target: string): Promise<PathResult> {
  return fetchJson<PathResult>(
    `${BASE}/graph/path?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`
  );
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

export async function exportData(data: Record<string, unknown>[], format: "csv" | "json"): Promise<Blob> {
  const res = await fetch(`${BASE}/chat/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, format }),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}
