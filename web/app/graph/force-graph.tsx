"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { cn } from "@/lib/utils";

// Live neighbourhood of the graph, laid out with d3-force in the browser. Colours are by LABEL
// (what kind of thing) — verdict colours are reserved for verdicts elsewhere in the console.
export type GNode = { id: string; label: string; name?: string; sha?: string; kind?: string; severity?: string };
export type GEdge = { s: string; t: string; type: string };

type SimNode = SimulationNodeDatum & GNode & { r: number };
type SimLink = SimulationLinkDatum<SimNode> & { type: string };

const LABEL: Record<string, { fill: string; text: string; r: number }> = {
  Service: { fill: "#ff6a1a", text: "Service", r: 9 },
  Lockfile: { fill: "#f5b400", text: "Lockfile", r: 6 },
  Version: { fill: "#8b93a7", text: "Version", r: 4.5 },
  Package: { fill: "#5aa9ff", text: "Package", r: 5.5 },
  Advisory: { fill: "#ff5c5c", text: "Advisory", r: 7 },
  Maintainer: { fill: "#2fd07f", text: "Maintainer", r: 5 },
  File: { fill: "#c084fc", text: "File", r: 4 },
};

const short = (k: string) =>
  k.startsWith("lock:") ? "@" + (k.split("@").pop() ?? "").slice(0, 10) : k.replace(/^(pkg:npm\/|svc:|npm:|file:)/, "");

export function ForceGraph({
  nodes,
  edges,
  height = 480,
  selected = null,
  onSelect,
}: {
  nodes: GNode[];
  edges: GEdge[];
  height?: number;
  selected?: string | null;
  onSelect?: (n: GNode | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [pos, setPos] = useState<{ n: SimNode[]; l: SimLink[] }>({ n: [], l: [] });
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false); // click vs pan: >4px of movement is a pan, not a select

  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  // Wheel-zoom must be a NON-passive native listener: React's onWheel is passive, so the page
  // scrolls under the graph. Zoom is anchored on the cursor and confined to the SVG.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(5, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const key = useMemo(() => nodes.map((n) => n.id).join("|") + "#" + edges.length, [nodes, edges]);

  useEffect(() => {
    const sn: SimNode[] = nodes.map((n) => ({ ...n, r: LABEL[n.label]?.r ?? 5 }));
    const byId = new Map(sn.map((n) => [n.id, n]));
    const sl: SimLink[] = edges
      .filter((e) => byId.has(e.s) && byId.has(e.t))
      .map((e) => ({ source: byId.get(e.s)!, target: byId.get(e.t)!, type: e.type }));
    const sim = forceSimulation(sn)
      .force("link", forceLink<SimNode, SimLink>(sl).id((d) => d.id).distance((l) => (l.type === "HAS_LOCKFILE" ? 60 : l.type === "RESOLVED" ? 42 : 34)).strength(0.6))
      .force("charge", forceManyBody().strength(-90))
      .force("collide", forceCollide<SimNode>().radius((d) => d.r + 6))
      .force("center", forceCenter(width / 2, height / 2))
      .stop();
    for (let i = 0; i < 260; i++) sim.tick();
    setPos({ n: sn, l: sl });
    // fit to view after layout
    const xs = sn.map((n) => n.x ?? 0), ys = sn.map((n) => n.y ?? 0);
    if (sn.length) {
      const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 140, minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30;
      const k = Math.min(1.6, Math.max(0.3, Math.min(width / (maxX - minX), height / (maxY - minY))));
      setView({ k, x: (width - (minX + maxX) * k) / 2, y: (height - (minY + maxY) * k) / 2 });
    } else setView({ x: 0, y: 0, k: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      (m.get(e.s) ?? m.set(e.s, new Set()).get(e.s)!).add(e.t);
      (m.get(e.t) ?? m.set(e.t, new Set()).get(e.t)!).add(e.s);
    }
    return m;
  }, [edges]);

  const zoomBy = (f: number) =>
    setView((v) => {
      const k = Math.min(5, Math.max(0.3, v.k * f));
      const cx = width / 2;
      const cy = height / 2;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  const fit = () => {
    if (!pos.n.length) return;
    const xs = pos.n.map((n) => n.x ?? 0);
    const ys = pos.n.map((n) => n.y ?? 0);
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 140, minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30;
    const k = Math.min(5, Math.max(0.3, Math.min(width / (maxX - minX), height / (maxY - minY))));
    setView({ k, x: (width - (minX + maxX) * k) / 2, y: (height - (minY + maxY) * k) / 2 });
  };
  const onDown = (e: React.MouseEvent) => {
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 4) moved.current = true;
    setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) }));
  };
  const onUp = () => (drag.current = null);
  const pick = (n: GNode | null) => {
    if (!moved.current) onSelect?.(n);
  };

  const focus = hover ?? selected;
  const dim = (id: string) => focus != null && focus !== id && !neighbours.get(focus)?.has(id);
  const labels = [...new Set(nodes.map((n) => n.label))].filter((l) => LABEL[l]);

  return (
    <div ref={ref} className="relative overflow-hidden rounded-xl border border-border bg-card elev">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label="graph neighbourhood"
        className="block cursor-grab touch-none select-none overscroll-contain active:cursor-grabbing"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onClick={() => pick(null)}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {pos.l.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            const off = dim(s.id) || dim(t.id);
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={l.type === "AFFECTS" ? "#ff5c5c" : "#3a3f4d"}
                strokeOpacity={off ? 0.08 : l.type === "AFFECTS" ? 0.7 : 0.55}
                strokeWidth={l.type === "AFFECTS" ? 1.4 : 1}
              />
            );
          })}
          {pos.n.map((n) => {
            const c = LABEL[n.label] ?? LABEL.Version;
            const off = dim(n.id);
            const isSel = selected === n.id;
            const showLabel = focus === n.id || n.label === "Service" || n.label === "Advisory" || (n.label === "Lockfile" && pos.n.length < 60) || neighbours.get(focus ?? "")?.has(n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  pick(isSel ? null : n);
                }}
                className="cursor-pointer"
              >
                {isSel && <circle r={n.r + 5} fill="none" stroke="#ff6a1a" strokeWidth={1.5} strokeOpacity={0.9} />}
                <circle r={n.r} fill={c.fill} fillOpacity={off ? 0.15 : 0.95} stroke="#0b0c0f" strokeWidth={1.2} />
                {showLabel && (
                  <text x={n.r + 4} y={3.5} fontSize={n.label === "Service" ? 11 : 10} fontFamily="var(--font-jet), ui-monospace, monospace" fill={off ? "#3a3f4d" : "#e6e8ee"}>
                    {short(n.id).length > 34 ? short(n.id).slice(0, 32) + "…" : short(n.id)}
                  </text>
                )}
                <title>
                  {n.label} · {n.id}
                  {n.sha ? ` · ${n.sha}` : ""}
                  {n.kind ? ` · ${n.kind}/${n.severity}` : ""}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
        {labels.map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block size-2 rounded-full")} style={{ background: LABEL[l].fill }} />
            {LABEL[l].text}
          </span>
        ))}
        <span className="ml-2 opacity-70">scroll to zoom · drag to pan · click to select</span>
      </div>
      <div className="pointer-events-none absolute right-3 top-2 num text-[10.5px] text-muted-foreground">
        {nodes.length} nodes · {edges.length} edges
      </div>
      <div className="absolute right-2 bottom-2 flex overflow-hidden rounded-md border border-border bg-background/90 backdrop-blur" role="group" aria-label="zoom">
        <button type="button" onClick={() => zoomBy(1.25)} className="grid size-9 place-items-center text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50" aria-label="zoom in">+</button>
        <button type="button" onClick={() => zoomBy(0.8)} className="grid size-9 place-items-center border-l border-border text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50" aria-label="zoom out">−</button>
        <button type="button" onClick={fit} className="grid h-9 min-w-9 place-items-center border-l border-border px-2 text-[10.5px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50" aria-label="fit to view">fit</button>
      </div>
    </div>
  );
}
