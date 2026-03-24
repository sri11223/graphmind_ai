/* ── Graph types ── */

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  color: string;
  val: number;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/* ── Chat types ── */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
  data?: Record<string, unknown>[] | null;
  referencedNodes?: string[];
  timestamp?: number;
}

export interface ChatApiResponse {
  answer: string;
  sql: string | null;
  data: Record<string, unknown>[] | null;
  referencedNodes: string[];
}

/* ── Node detail ── */

export interface Neighbor {
  id: string;
  type: string;
  label: string;
  edgeType: string;
  direction: "incoming" | "outgoing";
}

export interface NodeDetail {
  id: string;
  properties: Record<string, unknown>;
  neighbors: Neighbor[];
}

/* ── Stats ── */

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

/* ── Analytics ── */

export interface AnalyticsData {
  funnel: {
    orders: number;
    delivered: number;
    billed: number;
    paid: number;
  };
  totalRevenue: number;
  topCustomers: { name: string; orders: number; revenue: number }[];
  topProducts: { name: string; orders: number }[];
  statusDistribution: { status: string; count: number }[];
  monthlyTrend: { month: string; revenue: number; invoices: number }[];
}

/* ── Path Finder ── */

export interface PathResult {
  path: { id: string; type: string; label: string; color: string }[];
  edges: { source: string; target: string; type: string }[];
  length: number;
  error?: string;
}

/* ── Communities / Clustering ── */

export interface ClusterInfo {
  clusterId: number;
  size: number;
  nodeTypes: Record<string, number>;
  sampleNodes: string[];
}

export interface CommunitiesData {
  totalClusters: number;
  assignments: Record<string, number>;
  clusters: ClusterInfo[];
}

/* ── Centrality ── */

export interface CentralityNode {
  id: string;
  type: string;
  label: string;
  score: number;
}

export interface CentralityData {
  degree: CentralityNode[];
  betweenness: CentralityNode[];
  pagerank: CentralityNode[];
}

/* ── Entity colour map (matches backend PALETTE) ── */

export const ENTITY_COLORS: Record<string, string> = {
  SalesOrder: "#3B82F6",
  Delivery: "#10B981",
  BillingDocument: "#F59E0B",
  JournalEntry: "#8B5CF6",
  Payment: "#EC4899",
  Customer: "#EF4444",
  Product: "#06B6D4",
  Plant: "#6B7280",
};
