import { useEffect, useState, useRef, useCallback } from "react";
import { X, ArrowRight, ArrowLeft, Zap, GripVertical } from "lucide-react";
import { getNodeDetail } from "../services/api";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import type { GraphNode, NodeDetail, Neighbor } from "../types";
import { ENTITY_COLORS } from "../types";

interface Props {
  node: GraphNode;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  onHighlightNeighbors?: (ids: string[]) => void;
}

// Keys to hide from the property view (internal / redundant)
const HIDDEN_KEYS = new Set(["type", "label", "color", "val", "x", "y", "vx", "vy", "fx", "fy", "index", "__indexColor"]);

export default function NodeInspector({ node, onClose, onNavigate, onHighlightNeighbors }: Props) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset position when node changes
  useEffect(() => { setPos(null); }, [node.id]);

  useEffect(() => {
    setDetail(null);
    getNodeDetail(node.id).then(setDetail).catch(console.error);
  }, [node.id]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // don't drag on button clicks
    e.preventDefault();
    dragging.current = true;
    const rect = panelRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const parent = panelRef.current?.offsetParent as HTMLElement;
      const pRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const panelW = panelRef.current?.offsetWidth ?? 320;
      const panelH = panelRef.current?.offsetHeight ?? 400;
      const x = Math.max(0, Math.min(ev.clientX - pRect.left - dragOffset.current.x, pRect.width - panelW));
      const y = Math.max(0, Math.min(ev.clientY - pRect.top - dragOffset.current.y, pRect.height - panelH));
      setPos({ x, y });
    };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const style = pos
    ? { left: pos.x, top: pos.y, right: "auto" }
    : { top: "12px", right: "416px" };

  const props = detail?.properties ?? {};
  const displayProps = Object.entries(props).filter(
    ([k]) => !HIDDEN_KEYS.has(k) && props[k] !== null && props[k] !== ""
  );

  return (
    <div
      ref={panelRef}
      className="absolute w-80 max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col z-20 overflow-hidden"
      style={{ ...style, userSelect: dragging.current ? "none" : undefined }}
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical size={12} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          <Badge color={node.color} size="md">{node.type}</Badge>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate ml-1">{node.id}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close inspector">
          <X size={14} />
        </Button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Properties</p>
        <dl className="space-y-1">
          {displayProps.map(([key, val]) => (
            <div key={key} className="flex gap-2 text-xs">
              <dt className="text-gray-400 dark:text-gray-500 flex-shrink-0 w-[110px] truncate" title={key}>{key}:</dt>
              <dd className="text-gray-700 dark:text-gray-200 font-medium break-all">{String(val)}</dd>
            </div>
          ))}
        </dl>

        {/* Connections */}
        {detail && detail.neighbors.length > 0 && (
          <>
            <div className="flex items-center justify-between mt-4 mb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Connections ({detail.neighbors.length})
              </p>
              {onHighlightNeighbors && (
                <button
                  onClick={() =>
                    onHighlightNeighbors([node.id, ...detail.neighbors.map((n) => n.id)])
                  }
                  className="flex items-center gap-1 text-[10px] text-brand-500 hover:text-brand-600 transition font-medium"
                  title="Highlight all connections in graph"
                >
                  <Zap size={10} />
                  Highlight All
                </button>
              )}
            </div>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {detail.neighbors.map((nb: Neighbor, i: number) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      onNavigate(nb.id);
                      onHighlightNeighbors?.([nb.id]);
                    }}
                    className="w-full flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left group"
                  >
                    {nb.direction === "incoming" ? (
                      <ArrowLeft size={10} className="text-gray-300 dark:text-gray-600" />
                    ) : (
                      <ArrowRight size={10} className="text-gray-300 dark:text-gray-600" />
                    )}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ENTITY_COLORS[nb.type] ?? "#999" }}
                    />
                    <span className="text-gray-600 dark:text-gray-300 truncate flex-1 group-hover:text-brand-500 transition">
                      {nb.label}
                    </span>
                    <span className="text-[10px] text-gray-300 dark:text-gray-600 flex-shrink-0">{nb.edgeType}</span>
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
