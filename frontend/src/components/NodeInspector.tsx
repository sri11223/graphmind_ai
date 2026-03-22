import { useEffect, useState } from "react";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import { getNodeDetail } from "../services/api";
import type { GraphNode, NodeDetail, Neighbor } from "../types";
import { ENTITY_COLORS } from "../types";

interface Props {
  node: GraphNode;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

// Keys to hide from the property view (internal / redundant)
const HIDDEN_KEYS = new Set(["type", "label", "color", "val", "x", "y", "vx", "vy", "fx", "fy", "index", "__indexColor"]);

export default function NodeInspector({ node, onClose, onNavigate }: Props) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);

  useEffect(() => {
    setDetail(null);
    getNodeDetail(node.id).then(setDetail).catch(console.error);
  }, [node.id]);

  const props = detail?.properties ?? {};
  const displayProps = Object.entries(props).filter(
    ([k]) => !HIDDEN_KEYS.has(k) && props[k] !== null && props[k] !== ""
  );

  return (
    <div className="absolute top-3 right-[396px] w-80 max-h-[80vh] bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col z-20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: node.color }} />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-800 truncate">{node.type}</h3>
            <p className="text-[11px] text-gray-400 truncate">{node.id}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition">
          <X size={14} className="text-gray-400" />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Properties</p>
        <dl className="space-y-1">
          {displayProps.map(([key, val]) => (
            <div key={key} className="flex gap-2 text-xs">
              <dt className="text-gray-400 flex-shrink-0 w-[110px] truncate" title={key}>{key}:</dt>
              <dd className="text-gray-700 font-medium break-all">{String(val)}</dd>
            </div>
          ))}
        </dl>

        {/* Connections */}
        {detail && detail.neighbors.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-4 mb-1.5">
              Connections ({detail.neighbors.length})
            </p>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {detail.neighbors.map((nb: Neighbor, i: number) => (
                <li key={i}>
                  <button
                    onClick={() => onNavigate(nb.id)}
                    className="w-full flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 transition text-left group"
                  >
                    {nb.direction === "incoming" ? (
                      <ArrowLeft size={10} className="text-gray-300" />
                    ) : (
                      <ArrowRight size={10} className="text-gray-300" />
                    )}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ENTITY_COLORS[nb.type] ?? "#999" }}
                    />
                    <span className="text-gray-600 truncate flex-1 group-hover:text-brand-600 transition">
                      {nb.label}
                    </span>
                    <span className="text-[10px] text-gray-300 flex-shrink-0">{nb.edgeType}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
