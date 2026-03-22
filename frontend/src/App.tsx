import { useState, useEffect, useCallback } from "react";
import GraphCanvas from "./components/GraphCanvas";
import ChatPanel from "./components/ChatPanel";
import NodeInspector from "./components/NodeInspector";
import SearchBar from "./components/SearchBar";
import { getGraphData, getGraphStats } from "./services/api";
import type { GraphData, GraphStats, GraphNode } from "./types";
import { ENTITY_COLORS } from "./types";

export default function App() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  useEffect(() => {
    Promise.all([getGraphData(), getGraphStats()])
      .then(([gd, gs]) => {
        setGraphData(gd);
        setStats(gs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  const handleHighlight = useCallback((nodeIds: string[]) => {
    setHighlightNodes(new Set(nodeIds));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading GraphMind AI…</p>
          <p className="text-gray-400 text-sm mt-1">Building O2C knowledge graph</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-sm">G</div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">GraphMind AI</h1>
            <p className="text-xs text-gray-400">Order to Cash Analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {stats && (
            <>
              <span><strong className="text-gray-700">{stats.totalNodes.toLocaleString()}</strong> nodes</span>
              <span><strong className="text-gray-700">{stats.totalEdges.toLocaleString()}</strong> edges</span>
            </>
          )}
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="px-2.5 py-1 rounded-md border border-gray-200 hover:bg-gray-50 transition text-xs"
          >
            {showLegend ? "Hide" : "Show"} Legend
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Graph area */}
        <div className="flex-1 relative">
          {graphData && (
            <GraphCanvas
              data={graphData}
              onNodeClick={handleNodeClick}
              highlightNodes={highlightNodes}
              selectedNode={selectedNode}
            />
          )}

          {/* Search bar */}
          <SearchBar
            onSelect={(nodeId) => {
              const node = graphData?.nodes.find((n) => n.id === nodeId);
              if (node) setSelectedNode(node);
            }}
          />

          {/* Legend overlay */}
          {showLegend && (
            <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg shadow-md px-3 py-2.5 z-10">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Entity Types</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(ENTITY_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[11px] text-gray-600">{type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Node inspector overlay */}
          {selectedNode && (
            <NodeInspector
              node={selectedNode}
              onClose={handleClearSelection}
              onNavigate={(nodeId) => {
                const node = graphData?.nodes.find((n) => n.id === nodeId);
                if (node) setSelectedNode(node);
              }}
            />
          )}
        </div>

        {/* Chat panel */}
        <ChatPanel onHighlightNodes={handleHighlight} />
      </div>
    </div>
  );
}
