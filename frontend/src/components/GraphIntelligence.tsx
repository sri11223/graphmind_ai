import { useState, useEffect, useCallback } from "react";
import { Network, BarChart3, X, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { getCommunities, getCentrality } from "../services/api";
import { Spinner } from "./ui";
import { ENTITY_COLORS } from "../types";
import type { CommunitiesData, CentralityData, CentralityNode } from "../types";

// Distinct cluster palette (10 colours → wraps for >10 clusters)
const CLUSTER_PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6",
  "#06B6D4", "#EF4444", "#84CC16", "#F97316", "#6366F1",
];

interface Props {
  onClose: () => void;
  onHighlightCluster: (nodeIds: string[]) => void;
  onClusterMode: (assignments: Record<string, number> | null) => void;
}

export default function GraphIntelligence({ onClose, onHighlightCluster, onClusterMode }: Props) {
  const [tab, setTab] = useState<"clusters" | "centrality">("clusters");
  const [communities, setCommunities] = useState<CommunitiesData | null>(null);
  const [centrality, setCentrality] = useState<CentralityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [centralityMetric, setCentralityMetric] = useState<"degree" | "betweenness" | "pagerank">("pagerank");
  const [clusterColoring, setClusterColoring] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getCommunities(), getCentrality()])
      .then(([c, cent]) => {
        setCommunities(c);
        setCentrality(cent);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggleClusterColoring = useCallback(() => {
    setClusterColoring((prev) => {
      const next = !prev;
      onClusterMode(next && communities ? communities.assignments : null);
      return next;
    });
  }, [communities, onClusterMode]);

  if (loading) {
    return (
      <div className="absolute inset-0 z-30 bg-white/95 dark:bg-gray-950/95 backdrop-blur flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Analyzing graph structure…</p>
        </div>
      </div>
    );
  }

  const metricData: CentralityNode[] = centrality ? centrality[centralityMetric] : [];
  const maxScore = metricData.length > 0 ? metricData[0].score : 1;

  return (
    <div className="absolute inset-0 z-30 bg-white/95 dark:bg-gray-950/95 backdrop-blur overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Network size={18} className="text-brand-500" />
          <h2 className="font-bold text-gray-900 dark:text-gray-100">Graph Intelligence</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-500">
            <RefreshCw size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-500">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 px-6">
        <button
          onClick={() => setTab("clusters")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === "clusters"
              ? "border-brand-500 text-brand-600 dark:text-brand-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Network size={14} className="inline mr-1.5 -mt-0.5" />
          Communities
        </button>
        <button
          onClick={() => setTab("centrality")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === "centrality"
              ? "border-brand-500 text-brand-600 dark:text-brand-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <BarChart3 size={14} className="inline mr-1.5 -mt-0.5" />
          Centrality
        </button>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* ── Communities tab ── */}
        {tab === "clusters" && communities && (
          <>
            {/* Summary */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
              <p className="text-sm opacity-80 mb-1">Louvain Community Detection</p>
              <p className="text-4xl font-bold">{communities.totalClusters}</p>
              <p className="text-sm opacity-70 mt-1">communities detected in {Object.keys(communities.assignments).length} nodes</p>
            </div>

            {/* Cluster coloring toggle */}
            <button
              onClick={toggleClusterColoring}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition ${
                clusterColoring
                  ? "bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              <span className="text-sm font-medium">
                {clusterColoring ? "Cluster coloring ON" : "Color graph by cluster"}
              </span>
              <div className={`w-10 h-5 rounded-full transition ${clusterColoring ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition mt-0.5 ${clusterColoring ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </button>

            {/* Cluster list */}
            <div className="space-y-2">
              {communities.clusters.map((cluster) => {
                const isExpanded = expanded === cluster.clusterId;
                const clrColor = CLUSTER_PALETTE[cluster.clusterId % CLUSTER_PALETTE.length];
                return (
                  <div key={cluster.clusterId} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : cluster.clusterId)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-left"
                    >
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: clrColor }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          Cluster {cluster.clusterId}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">{cluster.size} nodes</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onHighlightCluster(cluster.sampleNodes); }}
                        className="text-[10px] px-2 py-0.5 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-full hover:bg-brand-100 dark:hover:bg-brand-900/40 transition"
                      >
                        Highlight
                      </button>
                      {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1.5">Node Types</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {Object.entries(cluster.nodeTypes).map(([type, count]) => (
                            <span
                              key={type}
                              className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `${ENTITY_COLORS[type] ?? "#999"}22`, color: ENTITY_COLORS[type] ?? "#999" }}
                            >
                              {type}: {count}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Sample Nodes</p>
                        <div className="flex flex-wrap gap-1">
                          {cluster.sampleNodes.map((nid) => (
                            <span key={nid} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                              {nid}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Centrality tab ── */}
        {tab === "centrality" && centrality && (
          <>
            {/* Metric selector */}
            <div className="flex gap-2">
              {(["pagerank", "degree", "betweenness"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setCentralityMetric(m)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-xl border transition capitalize ${
                    centralityMetric === m
                      ? "bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300"
                      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700"
                  }`}
                >
                  {m === "pagerank" ? "PageRank" : m === "betweenness" ? "Betweenness" : "Degree"}
                </button>
              ))}
            </div>

            {/* Top-10 bar chart */}
            <div className="space-y-2">
              {metricData.slice(0, 15).map((node, i) => {
                const pct = maxScore > 0 ? (node.score / maxScore) * 100 : 0;
                return (
                  <div key={node.id} className="group">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono text-gray-400 w-5 text-right">{i + 1}</span>
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ENTITY_COLORS[node.type] ?? "#999" }}
                      />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                        {node.label}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {node.score < 0.001 ? node.score.toExponential(2) : node.score.toFixed(4)}
                      </span>
                    </div>
                    <div className="ml-7 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(pct, 2)}%`,
                          backgroundColor: ENTITY_COLORS[node.type] ?? "#3B82F6",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Insights */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Insights</p>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li>
                  <strong>Degree centrality</strong> — nodes with the most direct connections (hubs).
                </li>
                <li>
                  <strong>Betweenness centrality</strong> — nodes that act as bridges between clusters.
                </li>
                <li>
                  <strong>PageRank</strong> — nodes that are connected to other important nodes (recursive importance).
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
