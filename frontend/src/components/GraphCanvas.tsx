import { memo, useRef, useEffect, useCallback, useState, useMemo, lazy, Suspense } from "react";
import ForceGraph2D from "react-force-graph-2d";
// Lazy-load the 3D bundle (~800 KB Three.js) only when 3D mode is first activated
const ForceGraph3D = lazy(() => import("react-force-graph-3d"));
import * as THREE from "three";
import { useTheme } from "./providers/ThemeProvider";
import type { GraphData, GraphNode } from "../types";

interface Props {
  data: GraphData;
  onNodeClick: (node: GraphNode) => void;
  highlightNodes: Set<string>;
  selectedNode: GraphNode | null;
  mode3D: boolean;
  clusterAssignments?: Record<string, number> | null;
}

const CLUSTER_PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6",
  "#06B6D4", "#EF4444", "#84CC16", "#F97316", "#6366F1",
];

function GraphCanvas({ data, onNodeClick, highlightNodes, selectedNode, mode3D, clusterAssignments }: Props) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredLink, setHoveredLink] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

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
    }, 1200);
    return () => clearTimeout(timer);
  }, [data, mode3D]);

  const handleNodeClick = useCallback(
    (node: any) => {
      onNodeClick(node as GraphNode);
      if (mode3D) {
        // Fly camera to the clicked node
        const distance = 120;
        const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);
        fgRef.current?.cameraPosition(
          { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
          { x: node.x, y: node.y, z: node.z },
          800
        );
      } else {
        fgRef.current?.centerAt(node.x, node.y, 300);
      }
    },
    [onNodeClick, mode3D]
  );

  const isHighlighted = useCallback(
    (nodeId: string) => highlightNodes.size > 0 && highlightNodes.has(nodeId),
    [highlightNodes]
  );

  const isDark = theme === "dark";
  const bgColor = isDark ? "#0f1117" : "#fafbfc";
  const labelColor = isDark ? "#e5e7eb" : "#1f2937";
  const dimLabelColor = isDark ? "#6b7280" : "#9ca3af";

  // Helper: get node color (cluster mode or default)
  const getNodeColor = useCallback(
    (nodeId: string, defaultColor: string) => {
      if (clusterAssignments && nodeId in clusterAssignments) {
        return CLUSTER_PALETTE[clusterAssignments[nodeId] % CLUSTER_PALETTE.length];
      }
      return defaultColor;
    },
    [clusterAssignments]
  );

  // ── 2D node rendering ──
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const r = Math.max(2, Math.sqrt(n.val || 1) * 1.8);
      const isSelected = selectedNode?.id === n.id;
      const isHl = isHighlighted(n.id);
      const dimmed = highlightNodes.size > 0 && !isHl && !isSelected;
      const nodeColor = getNodeColor(n.id, n.color);

      if (isSelected || isHl) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, r + 3, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? "rgba(59,130,246,0.25)" : "rgba(236,72,153,0.25)";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
      ctx.fillStyle = dimmed ? `${nodeColor}44` : nodeColor;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

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
    [selectedNode, highlightNodes, isHighlighted, labelColor, dimLabelColor, getNodeColor]
  );

  // ── 3D node rendering ──
  const nodeThreeObject = useCallback(
    (node: any) => {
      const n = node as GraphNode;
      const r = Math.max(1.5, Math.sqrt(n.val || 1) * 1.2);
      const isSelected = selectedNode?.id === n.id;
      const isHl = isHighlighted(n.id);
      const dimmed = highlightNodes.size > 0 && !isHl && !isSelected;
      const nodeColor = getNodeColor(n.id, n.color);

      const group = new THREE.Group();

      // Main sphere
      const geo = new THREE.SphereGeometry(r, 16, 12);
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(nodeColor),
        transparent: dimmed,
        opacity: dimmed ? 0.2 : 1,
        shininess: 80,
      });
      const sphere = new THREE.Mesh(geo, mat);
      group.add(sphere);

      // Glow ring for selected / highlighted
      if (isSelected || isHl) {
        const ringGeo = new THREE.RingGeometry(r + 1, r + 2, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: isSelected ? 0x3b82f6 : 0xec4899,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);
      }

      // Label sprite
      if (isSelected || isHl || !dimmed) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const label = n.label || n.id;
        canvas.width = 256;
        canvas.height = 64;
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = "bold 24px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = isDark ? "#e5e7eb" : "#1f2937";
        ctx.fillText(label.slice(0, 24), 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: dimmed ? 0.3 : 0.9,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(20, 5, 1);
        sprite.position.set(0, r + 4, 0);
        group.add(sprite);
      }

      return group;
    },
    [selectedNode, highlightNodes, isHighlighted, isDark, getNodeColor]
  );

  const linkColor = useCallback(
    (link: any) => {
      const base = isDark ? "rgba(59,130,246," : "rgba(147,197,253,";
      if (highlightNodes.size === 0) return `${base}${isDark ? "0.2)" : "0.3)"}`;
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      if (highlightNodes.has(srcId) || highlightNodes.has(tgtId))
        return "rgba(59,130,246,0.7)";
      return `${base}${isDark ? "0.05)" : "0.08)"}`;
    },
    [highlightNodes, isDark]
  );

  const linkParticles = useCallback(
    (link: any) => {
      if (highlightNodes.size === 0) return 0;
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      return highlightNodes.has(srcId) || highlightNodes.has(tgtId) ? 3 : 0;
    },
    [highlightNodes]
  );

  // Memoize data to prevent re-rendering loops
  const graphData = useMemo(() => data, [data]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative" onMouseMove={handleMouseMove}>
      {mode3D ? (
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center text-sm opacity-60">
            Loading 3D engine…
          </div>
        }>
          <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeThreeObject={nodeThreeObject}
          onNodeClick={handleNodeClick}
          linkColor={linkColor}
          linkOpacity={0.6}
          linkWidth={0.4}
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleColor={() => "#3b82f6"}
          onLinkHover={(link) => setHoveredLink(link)}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={false}
          backgroundColor={bgColor}
          cooldownTicks={200}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.35}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 80)}
        />
        </Suspense>
      ) : (
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
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => "#3b82f6"}
          onLinkHover={(link) => setHoveredLink(link)}
          enableNodeDrag={true}
          cooldownTicks={200}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.4}
          backgroundColor={bgColor}
        />
      )}

      {/* Edge relationship type tooltip on hover */}
      {hoveredLink && (
        <div
          className="absolute z-30 pointer-events-none px-2 py-1 rounded-md text-[11px] font-medium shadow-lg border whitespace-nowrap"
          style={{
            left: mousePos.x + 14,
            top: Math.max(4, mousePos.y - 30),
            backgroundColor: theme === "dark" ? "rgba(17,24,39,0.95)" : "rgba(255,255,255,0.97)",
            borderColor: theme === "dark" ? "#374151" : "#e5e7eb",
            color: theme === "dark" ? "#e5e7eb" : "#1f2937",
          }}
        >
          <span className="text-blue-400 mr-1">⟶</span>
          {(hoveredLink as any).type ?? "–"}
        </div>
      )}
    </div>
  );
}

export default memo(GraphCanvas);
