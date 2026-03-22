import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useTheme } from "./providers/ThemeProvider";
import type { GraphData, GraphNode } from "../types";

interface Props {
  data: GraphData;
  onNodeClick: (node: GraphNode) => void;
  highlightNodes: Set<string>;
  selectedNode: GraphNode | null;
}

export default function GraphCanvas({ data, onNodeClick, highlightNodes, selectedNode }: Props) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Responsive sizing
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initial zoom-to-fit
  useEffect(() => {
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit(400, 60);
    }, 1000);
    return () => clearTimeout(timer);
  }, [data]);

  const handleNodeClick = useCallback(
    (node: any) => {
      onNodeClick(node as GraphNode);
      fgRef.current?.centerAt(node.x, node.y, 300);
    },
    [onNodeClick]
  );

  const isHighlighted = useCallback(
    (nodeId: string) => highlightNodes.size > 0 && highlightNodes.has(nodeId),
    [highlightNodes]
  );

  const isDark = theme === "dark";
  const bgColor = isDark ? "#0f1117" : "#fafbfc";
  const labelColor = isDark ? "#e5e7eb" : "#1f2937";
  const dimLabelColor = isDark ? "#6b7280" : "#9ca3af";

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const r = Math.max(2, Math.sqrt(n.val || 1) * 1.8);
      const isSelected = selectedNode?.id === n.id;
      const isHl = isHighlighted(n.id);
      const dimmed = highlightNodes.size > 0 && !isHl && !isSelected;

      // Glow for highlighted / selected
      if (isSelected || isHl) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, r + 3, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? "rgba(59,130,246,0.25)" : "rgba(236,72,153,0.25)";
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
      ctx.fillStyle = dimmed ? `${n.color}44` : n.color;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label on zoom
      if (globalScale > 2.5 || isSelected || isHl) {
        const label = n.label || n.id;
        const fontSize = Math.max(8, 12 / globalScale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = dimmed ? dimLabelColor : labelColor;
        ctx.fillText(label, node.x!, node.y! + r + 2);
      }
    },
    [selectedNode, highlightNodes, isHighlighted, labelColor, dimLabelColor]
  );

  const linkColor = useCallback(
    (link: any) => {
      const base = isDark ? "rgba(59,130,246," : "rgba(147,197,253,";
      if (highlightNodes.size === 0) return `${base}${isDark ? "0.2)" : "0.3)"}`;
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      if (highlightNodes.has(srcId) || highlightNodes.has(tgtId))
        return "rgba(59,130,246,0.6)";
      return `${base}${isDark ? "0.05)" : "0.08)"}`;
    },
    [highlightNodes, isDark]
  );

  // Memoize data to prevent re-rendering loops
  const graphData = useMemo(() => data, [data]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const r = Math.max(4, Math.sqrt((node as GraphNode).val || 1) * 2);
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        onNodeClick={handleNodeClick}
        linkColor={linkColor}
        linkWidth={0.5}
        linkDirectionalParticles={0}
        enableNodeDrag={true}
        cooldownTicks={200}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.4}
        backgroundColor={bgColor}
      />
    </div>
  );
}
