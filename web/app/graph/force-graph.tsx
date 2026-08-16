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

export function ForceGraph({ nodes, edges, height = 480 }: { nodes: GNode[]; edges: GEdge[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [pos, setPos] = useState<{ n: SimNode[]; l: SimLink[] }>({ n: [], l: [] });
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
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
    setView({ x: 0, y: 0, k: 1 });
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

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const k = Math.min(4, Math.max(0.4, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ ...v, k }));
  };
  const onDown = (e: React.MouseEvent) => (drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y });
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) }));
  };
  const onUp = () => (drag.current = null);

  const dim = (id: string) => hover !== null && hover !== id && !neighbours.get(hover)?.has(id);
  const labels = [...new Set(nodes.map((n) => n.label))].filter((l) => LABEL[l]);

  return (
    <div ref={ref} className="relative overflow-hidden rounded-lg border border-border bg-card">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="graph neighbourhood"
        className="block cursor-grab select-none active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
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
            const showLabel = hover === n.id || n.label === "Service" || n.label === "Advisory" || (n.label === "Lockfile" && pos.n.length < 60) || neighbours.get(hover ?? "")?.has(n.id);
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
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
        <span className="ml-2 opacity-70">scroll to zoom · drag to pan · hover to focus</span>
      </div>
      <div className="pointer-events-none absolute right-3 top-2 num text-[10.5px] text-muted-foreground">
        {nodes.length} nodes · {edges.length} edges
      </div>
    </div>
  );
}
