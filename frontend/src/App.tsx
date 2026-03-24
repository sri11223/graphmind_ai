import { useState, useEffect, useCallback } from "react";
import { Sun, Moon, BarChart3, Box, Layers, TrendingUp, Route, Filter, Network } from "lucide-react";
import GraphCanvas from "./components/GraphCanvas";
import ChatPanel from "./components/ChatPanel";
import NodeInspector from "./components/NodeInspector";
import SearchBar from "./components/SearchBar";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import PathFinder from "./components/PathFinder";
import GraphIntelligence from "./components/GraphIntelligence";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toolbar, Button, Spinner, Badge } from "./components/ui";
import { useTheme } from "./components/providers/ThemeProvider";
import { getGraphData, getGraphStats } from "./services/api";
import type { GraphData, GraphStats, GraphNode } from "./types";
import { ENTITY_COLORS } from "./types";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [filteredData, setFilteredData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [mode3D, setMode3D] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showPathFinder, setShowPathFinder] = useState(false);
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [clusterAssignments, setClusterAssignments] = useState<Record<string, number> | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([getGraphData(), getGraphStats()])
      .then(([gd, gs]) => {
        setGraphData(gd);
        setFilteredData(gd);
        setStats(gs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter graph by hidden node types
  useEffect(() => {
    if (!graphData) return;
    if (hiddenTypes.size === 0) {
      setFilteredData(graphData);
      return;
    }
    const visibleNodeIds = new Set(
      graphData.nodes.filter((n) => !hiddenTypes.has(n.type)).map((n) => n.id)
    );
    setFilteredData({
      nodes: graphData.nodes.filter((n) => visibleNodeIds.has(n.id)),
      links: graphData.links.filter((l) => {
        const src = typeof l.source === "string" ? l.source : l.source.id;
        const tgt = typeof l.target === "string" ? l.target : l.target.id;
        return visibleNodeIds.has(src) && visibleNodeIds.has(tgt);
      }),
    });
  }, [graphData, hiddenTypes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNode(null);
        setShowAnalytics(false);
        setShowPathFinder(false);
        setShowIntelligence(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleTypeFilter = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => setSelectedNode(node), []);
  const handleHighlight = useCallback((ids: string[]) => setHighlightNodes(new Set(ids)), []);
  const handleClearSelection = useCallback(() => setSelectedNode(null), []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-lg font-medium">Loading GraphMind AI…</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Building O2C knowledge graph</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      <Toolbar
        left={
          <>
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              G
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">GraphMind AI</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">Order to Cash Analytics</p>
            </div>
          </>
        }
        right={
          <>
            {stats && (
              <>
                <span className="text-gray-500 dark:text-gray-400">
                  <strong className="text-gray-700 dark:text-gray-200">{stats.totalNodes.toLocaleString()}</strong> nodes
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  <strong className="text-gray-700 dark:text-gray-200">{stats.totalEdges.toLocaleString()}</strong> edges
                </span>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowAnalytics(!showAnalytics)} icon={<TrendingUp size={14} />}>
              Analytics
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowIntelligence(!showIntelligence)} icon={<Network size={14} />}>
              Intelligence
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPathFinder(!showPathFinder)} icon={<Route size={14} />}>
              Path
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode3D(!mode3D)} icon={mode3D ? <Box size={14} /> : <Layers size={14} />}>
              {mode3D ? "3D" : "2D"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowLegend(!showLegend)} icon={<BarChart3 size={14} />}>
              {showLegend ? "Hide" : "Show"} Legend
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </>
        }
      />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Graph area */}
        <div className="flex-1 relative">
          {filteredData && (
            <GraphCanvas
              data={filteredData}
              onNodeClick={handleNodeClick}
              highlightNodes={highlightNodes}
              selectedNode={selectedNode}
              mode3D={mode3D}
              clusterAssignments={clusterAssignments}
            />
          )}

          {/* Search bar */}
          <SearchBar
            onSelect={(nodeId) => {
              const node = graphData?.nodes.find((n) => n.id === nodeId);
              if (node) setSelectedNode(node);
            }}
          />

          {/* Legend overlay with filter */}
          {showLegend && (
            <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur rounded-lg shadow-md border border-gray-200/50 dark:border-gray-700/50 px-3 py-2.5 z-10">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entity Types</p>
                <Filter size={10} className="text-gray-400" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(ENTITY_COLORS).map(([type, color]) => (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={`flex items-center gap-1.5 text-[11px] px-1 py-0.5 rounded transition ${
                      hiddenTypes.has(type)
                        ? "opacity-30 line-through"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-gray-600 dark:text-gray-300">{type}</span>
                    {stats?.nodesByType[type] != null && (
                      <span className="text-[9px] text-gray-400">({stats.nodesByType[type]})</span>
                    )}
                  </button>
                ))}
              </div>
              {hiddenTypes.size > 0 && (
                <button
                  onClick={() => setHiddenTypes(new Set())}
                  className="text-[10px] text-brand-500 hover:text-brand-600 mt-1.5 transition"
                >
                  Show all
                </button>
              )}
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

          {/* Path Finder overlay */}
          {showPathFinder && (
            <PathFinder
              onClose={() => setShowPathFinder(false)}
              onHighlightPath={handleHighlight}
            />
          )}

          {/* Analytics Dashboard overlay */}
          {showAnalytics && (
            <AnalyticsDashboard onClose={() => setShowAnalytics(false)} />
          )}

          {/* Graph Intelligence overlay */}
          {showIntelligence && (
            <GraphIntelligence
              onClose={() => setShowIntelligence(false)}
              onHighlightCluster={handleHighlight}
              onClusterMode={setClusterAssignments}
            />
          )}
        </div>

        {/* Chat panel */}
        <ChatPanel onHighlightNodes={handleHighlight} />
      </div>
    </div>
    </ErrorBoundary>
  );
}
