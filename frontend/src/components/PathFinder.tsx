import { useState, useCallback } from "react";
import { Route, Search, X, ArrowRight, Loader2 } from "lucide-react";
import { searchNodes, findPath } from "../services/api";
import { useDebounce } from "../hooks";
import { ENTITY_COLORS } from "../types";
import type { PathResult } from "../types";

interface Props {
  onClose: () => void;
  onHighlightPath: (nodeIds: string[]) => void;
}

export default function PathFinder({ onClose, onHighlightPath }: Props) {
  const [sourceQuery, setSourceQuery] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<{ id: string; type: string; label: string; color: string }[]>([]);
  const [targetResults, setTargetResults] = useState<{ id: string; type: string; label: string; color: string }[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [targetLabel, setTargetLabel] = useState("");
  const [result, setResult] = useState<PathResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeField, setActiveField] = useState<"source" | "target" | null>(null);

  const debouncedSource = useDebounce(sourceQuery, 250);
  const debouncedTarget = useDebounce(targetQuery, 250);

  // Search source
  useState(() => {
    if (debouncedSource.length >= 2 && !sourceId) {
      searchNodes(debouncedSource).then(setSourceResults).catch(() => {});
    } else {
      setSourceResults([]);
    }
  });

  // Search target
  useState(() => {
    if (debouncedTarget.length >= 2 && !targetId) {
      searchNodes(debouncedTarget).then(setTargetResults).catch(() => {});
    } else {
      setTargetResults([]);
    }
  });

  const handleSourceSearch = useCallback((q: string) => {
    setSourceQuery(q);
    setSourceId(null);
    setResult(null);
    setError("");
    if (q.length >= 2) {
      searchNodes(q).then(setSourceResults).catch(() => {});
    } else {
      setSourceResults([]);
    }
  }, []);

  const handleTargetSearch = useCallback((q: string) => {
    setTargetQuery(q);
    setTargetId(null);
    setResult(null);
    setError("");
    if (q.length >= 2) {
      searchNodes(q).then(setTargetResults).catch(() => {});
    } else {
      setTargetResults([]);
    }
  }, []);

  const selectSource = (id: string, label: string) => {
    setSourceId(id);
    setSourceLabel(label);
    setSourceQuery(label);
    setSourceResults([]);
    setActiveField(null);
  };

  const selectTarget = (id: string, label: string) => {
    setTargetId(id);
    setTargetLabel(label);
    setTargetQuery(label);
    setTargetResults([]);
    setActiveField(null);
  };

  const handleFind = async () => {
    if (!sourceId || !targetId) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await findPath(sourceId, targetId);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
        onHighlightPath(res.path.map((n) => n.id));
      }
    } catch {
      setError("Failed to find path");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute bottom-3 right-[416px] w-80 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Route size={14} className="text-brand-500" />
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Path Finder</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition">
          <X size={14} className="text-gray-400" />
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Source */}
        <div className="relative">
          <label className="text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500 mb-0.5 block">From</label>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-100 outline-none focus:border-brand-500 transition"
              placeholder="Search source node…"
              value={sourceQuery}
              onChange={(e) => handleSourceSearch(e.target.value)}
              onFocus={() => setActiveField("source")}
            />
          </div>
          {activeField === "source" && sourceResults.length > 0 && !sourceId && (
            <ul className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-32 overflow-y-auto z-10">
              {sourceResults.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => selectSource(r.id, r.label)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ENTITY_COLORS[r.type] ?? "#999" }} />
                    <span className="text-gray-700 dark:text-gray-200 truncate">{r.label}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{r.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Target */}
        <div className="relative">
          <label className="text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500 mb-0.5 block">To</label>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-100 outline-none focus:border-brand-500 transition"
              placeholder="Search target node…"
              value={targetQuery}
              onChange={(e) => handleTargetSearch(e.target.value)}
              onFocus={() => setActiveField("target")}
            />
          </div>
          {activeField === "target" && targetResults.length > 0 && !targetId && (
            <ul className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-32 overflow-y-auto z-10">
              {targetResults.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => selectTarget(r.id, r.label)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ENTITY_COLORS[r.type] ?? "#999" }} />
                    <span className="text-gray-700 dark:text-gray-200 truncate">{r.label}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{r.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Find button */}
        <button
          onClick={handleFind}
          disabled={!sourceId || !targetId || loading}
          className="w-full py-2 bg-brand-500 text-white text-xs font-medium rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />}
          {loading ? "Finding…" : "Find Shortest Path"}
        </button>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        )}

        {/* Result */}
        {result && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 border border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500 mb-1.5">
              Path ({result.length} hop{result.length !== 1 ? "s" : ""})
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {result.path.map((node, i) => (
                <span key={node.id} className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                    style={{ borderColor: node.color + "40", color: node.color, backgroundColor: node.color + "10" }}>
                    {node.label}
                  </span>
                  {i < result.path.length - 1 && (
                    <ArrowRight size={10} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
