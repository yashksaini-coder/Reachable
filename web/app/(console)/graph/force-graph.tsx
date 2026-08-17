"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { cn } from "@/lib/utils";

// Live neighbourhood of the graph, laid out with d3-force in the browser. Colours are by LABEL
// (what kind of thing) — the graph-only node palette; verdict colours are reserved for verdicts.
export type GNode = { id: string; label: string; name?: string; sha?: string; kind?: string; severity?: string };
export type GEdge = { s: string; t: string; type: string };

type SimNode = SimulationNodeDatum & GNode & { r: number };
type SimLink = SimulationLinkDatum<SimNode> & { type: string };

// kind (lower-case, the seed vocabulary) · CSS colour token · radius (service 7, package 6, else 5)
export const LABEL: Record<string, { kind: string; color: string; bg: string; r: number }> = {
  Service: { kind: "service", color: "var(--color-node-service)", bg: "bg-node-service", r: 7 },
  Lockfile: { kind: "lockfile", color: "var(--color-node-lockfile)", bg: "bg-node-lockfile", r: 5 },
  Version: { kind: "version", color: "var(--color-node-version)", bg: "bg-node-version", r: 5 },
  Package: { kind: "package", color: "var(--color-node-package)", bg: "bg-node-package", r: 6 },
  Advisory: { kind: "advisory", color: "var(--color-node-advisory)", bg: "bg-node-advisory", r: 5 },
  Maintainer: { kind: "maintainer", color: "var(--color-node-maintainer)", bg: "bg-node-maintainer", r: 5 },
  File: { kind: "file", color: "var(--color-node-file)", bg: "bg-node-file", r: 5 },
};
export const LEGEND = Object.values(LABEL);

const short = (k: string) =>
  k.startsWith("lock:") ? "@" + (k.split("@").pop() ?? "").slice(0, 10) : k.replace(/^(pkg:npm\/|svc:|npm:|file:)/, "");

// 32px visual control with a ≥40px hit area (rule 5) — the box stays the prototype's size.
const HIT = "relative before:absolute before:-inset-1 before:content-['']";
const CTRL = cn(
  "grid h-8 min-w-8 place-items-center rounded-[7px] border border-border text-mut transition-[background-color,color] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg active:scale-[0.97]",
  HIT,
);

const ZOOM = [0.5, 2.4] as const; // relative to the fitted scale

export function ForceGraph({
  nodes,
  edges,
  seed = "all",
  selected = null,
  onSelect,
  children,
}: {
  nodes: GNode[];
  edges: GEdge[];
  seed?: string; // "service" | "lockfile" | "package" | "advisory" | "all" — non-seed nodes dim to .32
  selected?: string | null;
  onSelect?: (n: GNode | null) => void;
  children?: ReactNode; // overlays inside the canvas (the side panel)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(900);
  const [height, setHeight] = useState(430); // 320 on phones, 430 from 600px — read from the CSS-sized box
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false); // click vs pan: >4px of movement is a pan, not a select

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setWidth(Math.max(320, e.contentRect.width));
      setHeight(Math.max(240, e.contentRect.height));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // Layout is pure (d3-force ticked to rest), so it is derived, not stored: nodes+edges+width → positions + fit.
  const key = nodes.map((n) => n.id).join("|") + "#" + edges.length;
  const layout = useMemo(() => {
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
    let fit = { x: 0, y: 0, k: 1 };
    if (sn.length) {
      const xs = sn.map((n) => n.x ?? 0), ys = sn.map((n) => n.y ?? 0);
      const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 140, minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30;
      const k = Math.min(1.6, Math.max(0.3, Math.min(width / (maxX - minX), height / (maxY - minY))));
      fit = { k, x: (width - (minX + maxX) * k) / 2, y: (height - (minY + maxY) * k) / 2 };
    }
    return { n: sn, l: sl, fit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height]);
  const pos = layout;

  // The view is the fit until the user pans/zooms; a new layout resets it (state is tagged with its layout).
  const [viewState, setViewState] = useState<{ x: number; y: number; k: number; of: typeof layout } | null>(null);
  const view = viewState && viewState.of === layout ? viewState : layout.fit;
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const setView = (f: (v: { x: number; y: number; k: number }) => { x: number; y: number; k: number }) =>
    setViewState((prev) => {
      const L = layoutRef.current;
      const base = prev && prev.of === L ? prev : L.fit;
      return { ...f(base), of: L };
    });
  const clampK = (k: number) => Math.min(layoutRef.current.fit.k * ZOOM[1], Math.max(layoutRef.current.fit.k * ZOOM[0], k));
  const fitTo = () => setViewState(null);

  // Wheel-zoom must be a NON-passive native listener (React's onWheel cannot preventDefault), so the
  // page never scrolls under the canvas. Zoom is anchored on the cursor, 0.5–2.4× of the fit.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = clampK(v.k * (e.deltaY > 0 ? 0.93 : 1.07));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges) {
      m.set(e.s, (m.get(e.s) ?? 0) + 1);
      m.set(e.t, (m.get(e.t) ?? 0) + 1);
    }
    return m;
  }, [edges]);
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
      const k = clampK(v.k * f);
      const cx = width / 2, cy = height / 2;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  const onDown = (e: React.PointerEvent) => {
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 4) moved.current = true;
    setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) }));
  };
  const onUp = () => (drag.current = null);
  const pick = (n: GNode | null) => {
    if (!moved.current) onSelect?.(n);
  };

  const focus = hover ?? selected;
  // Prototype: non-seed nodes dim to .32 (the selected one is exempt); a focused node also keeps
  // its neighbourhood lit so the picture answers "what touches this?".
  const dim = (n: SimNode) =>
    (seed !== "all" && (LABEL[n.label]?.kind ?? "") !== seed && selected !== n.id) ||
    (focus != null && focus !== n.id && !neighbours.get(focus)?.has(n.id));
  const tip = hover ? pos.n.find((n) => n.id === hover) : null;

  return (
    <>
      <div
        ref={ref}
        className="relative h-[320px] cursor-grab touch-none select-none overflow-hidden overscroll-contain active:cursor-grabbing min-[600px]:h-[430px]"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <svg ref={svgRef} width={width} height={height} role="img" aria-label="graph neighbourhood" className="block" onClick={() => pick(null)}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {pos.l.map((l, i) => {
              const s = l.source as SimNode;
              const t = l.target as SimNode;
              const off = dim(s) || dim(t);
              const danger = l.type === "AFFECTS";
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={danger ? "var(--color-node-advisory)" : "var(--color-dim)"}
                  strokeOpacity={off ? 0.06 : danger ? 0.45 : 0.2}
                  strokeWidth={danger ? 1.3 : 1}
                  className="transition-[stroke-opacity] duration-[250ms] ease-[var(--ease)]"
                />
              );
            })}
            {pos.n.map((n) => {
              const c = LABEL[n.label] ?? LABEL.Version;
              const off = dim(n);
              const isSel = selected === n.id;
              const showLabel = focus === n.id || n.label === "Service" || n.label === "Advisory" || (n.label === "Lockfile" && pos.n.length < 60) || neighbours.get(focus ?? "")?.has(n.id);
              const text = short(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(isSel ? null : n);
                  }}
                  className="cursor-pointer transition-opacity duration-[250ms] ease-[var(--ease)]"
                  style={{ opacity: off ? 0.32 : 1 }}
                >
                  {isSel && <circle r={n.r + 5} fill="none" stroke={c.color} strokeWidth={1} strokeOpacity={0.4} />}
                  <circle r={n.r} fill={c.color} fillOpacity={0.9} />
                  {showLabel && (
                    <text x={n.r + 6} y={3.5} className="font-mono text-[11.5px]" fill={off ? "var(--color-dim)" : "var(--color-mut)"}>
                      {text.length > 34 ? text.slice(0, 32) + "…" : text}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-[7px] border border-border bg-pop px-[9px] py-[7px] font-mono text-[12px] leading-[1.4] text-mut elev animate-[fade_.15s_var(--ease)_both]"
            style={{ left: view.x + (tip.x ?? 0) * view.k, top: view.y + (tip.y ?? 0) * view.k }}
          >
            {short(tip.id)}
            <br />
            <span className="text-dim">
              {LABEL[tip.label]?.kind ?? tip.label.toLowerCase()} · {degree.get(tip.id) ?? 0} edges
            </span>
          </div>
        )}
        {children}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line px-4 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-3.5 gap-y-2 font-mono text-[11.5px] leading-none text-dim max-[600px]:basis-full">
          {LEGEND.map((g) => (
            <span key={g.kind} className="inline-flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", g.bg)} aria-hidden />
              {g.kind}
            </span>
          ))}
        </div>
        <span className="num ml-auto whitespace-nowrap text-[11.5px] leading-none text-dim">
          {nodes.length} nodes · {edges.length} edges
        </span>
        <div className="flex gap-1" role="group" aria-label="zoom">
          <button type="button" onClick={() => zoomBy(1 / 1.2)} className={CTRL} aria-label="zoom out">
            −
          </button>
          <button type="button" onClick={() => zoomBy(1.2)} className={CTRL} aria-label="zoom in">
            +
          </button>
          <button type="button" onClick={fitTo} className={cn(CTRL, "px-2.5 text-[12px] font-medium")} aria-label="fit to view">
            fit
          </button>
        </div>
      </div>
    </>
  );
}
