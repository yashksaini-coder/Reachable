"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { cn } from "@/lib/utils";

// Live neighbourhood of the graph, laid out with d3-force in the browser and left RUNNING: the
// layout settles in front of the reader (alpha decay), nodes can be dragged (the simulation
// re-heats and the rest of the graph responds), hovering lights a node's neighbourhood, and
// labels are decluttered every frame so hubs stay readable. Colours are by LABEL (what kind of
// thing) — the graph-only node palette; verdict colours are reserved for verdicts.
export type GNode = { id: string; label: string; name?: string; sha?: string; kind?: string; severity?: string };
export type GEdge = { s: string; t: string; type: string };

type SimNode = SimulationNodeDatum & GNode & { r: number; born: number };
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
const clip = (t: string, n = 30) => (t.length > n ? t.slice(0, n - 2) + "…" : t);

// 32px visual control with a ≥40px hit area (rule 5) — the box stays the prototype's size.
const HIT = "relative before:absolute before:-inset-1 before:content-['']";
const CTRL = cn(
  "grid h-8 min-w-8 place-items-center rounded-[7px] border border-border text-mut transition-[background-color,color] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg active:scale-[0.97]",
  HIT,
);

const ZOOM = [0.5, 2.4] as const; // relative to the fitted scale
const CHAR = 6.9; // px per mono char at 11.5px — for label collision boxes

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
  const [height, setHeight] = useState(430);
  const [hover, setHover] = useState<string | null>(null);
  const [frame, setFrame] = useState(0); // the simulation tick stamps a time here to re-render positions
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const dragNode = useRef<SimNode | null>(null);
  const moved = useRef(false); // click vs pan/drag: >4px of movement is not a select
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null);
  const [reduce, setReduce] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const ro = new ResizeObserver(([e]) => {
      setWidth(Math.max(320, e.contentRect.width));
      setHeight(Math.max(240, e.contentRect.height));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // Simulation nodes/links are created once per data set and then owned by d3 (mutable positions).
  const key = nodes.map((n) => n.id).join("|") + "#" + edges.length;
  const graph = useMemo(() => {
    const sn: SimNode[] = nodes.map((n) => ({ ...n, r: LABEL[n.label]?.r ?? 5, born: 0 }));
    const byId = new Map(sn.map((n) => [n.id, n]));
    const sl: SimLink[] = edges
      .filter((e) => byId.has(e.s) && byId.has(e.t))
      .map((e) => ({ source: byId.get(e.s)!, target: byId.get(e.t)!, type: e.type }));
    const deg = new Map<string, number>();
    for (const e of edges) {
      deg.set(e.s, (deg.get(e.s) ?? 0) + 1);
      deg.set(e.t, (deg.get(e.t) ?? 0) + 1);
    }
    return { n: sn, l: sl, deg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Start (or restart) the live simulation whenever the data or the canvas size changes. Hubs
  // repel harder and long edges spread the neighbourhood so labels have room; a soft pull to the
  // centre keeps everything on the canvas. Reduced motion → tick to rest silently.
  useEffect(() => {
    sim.current?.stop();
    const t0 = performance.now();
    graph.n.forEach((n, i) => (n.born = t0 + Math.min(i, 40) * 12)); // staggered enter
    const deg = graph.deg;
    const s = forceSimulation<SimNode, SimLink>(graph.n)
      .force(
        "link",
        forceLink<SimNode, SimLink>(graph.l)
          .id((d) => d.id)
          .distance((l) => (l.type === "HAS_LOCKFILE" ? 84 : l.type === "RESOLVED" ? 56 : l.type === "AFFECTS" ? 62 : 46))
          .strength(0.5),
      )
      .force("charge", forceManyBody<SimNode>().strength((d) => -120 - 18 * Math.min(8, deg.get(d.id) ?? 0)).distanceMax(420))
      .force("collide", forceCollide<SimNode>().radius((d) => d.r + 9).iterations(2))
      .force("center", forceCenter(width / 2, height / 2))
      .force("x", forceX(width / 2).strength(0.035))
      .force("y", forceY(height / 2).strength(0.045))
      .alphaDecay(0.028)
      .velocityDecay(0.35);
    sim.current = s;
    if (reduce) {
      s.stop();
      for (let i = 0; i < 300; i++) s.tick();
      const id = requestAnimationFrame(() => setFrame(performance.now()));
      return () => {
        cancelAnimationFrame(id);
        s.stop();
      };
    }
    s.on("tick", () => setFrame(performance.now()));
    return () => {
      s.stop();
    };
  }, [graph, width, height, reduce]);

  // The fit follows the live positions until the user pans/zooms; a new graph resets it.
  const fitOf = () => {
    const sn = graph.n;
    if (!sn.length) return { x: 0, y: 0, k: 1 };
    const xs = sn.map((n) => n.x ?? 0), ys = sn.map((n) => n.y ?? 0);
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 150, minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30;
    const k = Math.min(1.6, Math.max(0.3, Math.min(width / (maxX - minX), height / (maxY - minY))));
    return { k, x: (width - (minX + maxX) * k) / 2, y: (height - (minY + maxY) * k) / 2 };
  };
  const [viewState, setViewState] = useState<{ x: number; y: number; k: number; of: typeof graph } | null>(null);
  const fit = fitOf();
  const view = viewState && viewState.of === graph ? viewState : fit;
  const viewRef = useRef(view);
  const fitRef = useRef(fit);
  useEffect(() => {
    viewRef.current = view;
    fitRef.current = fit;
  });
  const setView = (f: (v: { x: number; y: number; k: number }) => { x: number; y: number; k: number }) =>
    setViewState((prev) => ({ ...f(prev && prev.of === graph ? prev : fitRef.current), of: graph }));
  const clampK = (k: number) => Math.min(fitRef.current.k * ZOOM[1], Math.max(fitRef.current.k * ZOOM[0], k));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

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

  // Pointer model: down on empty canvas = pan; down on a node = drag that node (the simulation
  // re-heats so the neighbourhood follows); a click without movement selects.
  const toGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  };
  const onDown = (e: React.PointerEvent) => {
    moved.current = false;
    if (dragNode.current) return; // a node handler already claimed this pointer
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragNode.current) {
      const p = toGraph(e.clientX, e.clientY);
      dragNode.current.fx = p.x;
      dragNode.current.fy = p.y;
      moved.current = true;
      return;
    }
    if (!pan.current) return;
    if (Math.abs(e.clientX - pan.current.x) + Math.abs(e.clientY - pan.current.y) > 4) moved.current = true;
    setView((v) => ({ ...v, x: pan.current!.vx + (e.clientX - pan.current!.x), y: pan.current!.vy + (e.clientY - pan.current!.y) }));
  };
  const onUp = () => {
    if (dragNode.current) {
      dragNode.current.fx = null;
      dragNode.current.fy = null;
      dragNode.current = null;
      setDragging(false);
      sim.current?.alphaTarget(0);
    }
    pan.current = null;
  };
  const startDrag = (n: SimNode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    moved.current = false;
    dragNode.current = n;
    n.fx = n.x;
    n.fy = n.y;
    setDragging(true);
    if (!reduce) sim.current?.alphaTarget(0.25).restart();
    (ref.current as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  };
  const pick = (n: GNode | null) => {
    if (!moved.current) onSelect?.(n);
  };

  const focus = hover ?? selected;
  // Prototype: non-seed nodes dim to .32 (the selected one is exempt); a focused node also keeps
  // its neighbourhood lit so the picture answers "what touches this?".
  const dim = (n: SimNode) =>
    (seed !== "all" && (LABEL[n.label]?.kind ?? "") !== seed && selected !== n.id) ||
    (focus != null && focus !== n.id && !neighbours.get(focus)?.has(n.id));
  const tip = hover ? graph.n.find((n) => n.id === hover) : null;

  // Label declutter: candidates in priority order (focus + its neighbours, then services and
  // advisories by degree, then lockfiles when the graph is small); a label is drawn only if its
  // box does not overlap one already placed. Runs per frame — cheap at ≤ ~150 nodes.
  const labelled = useMemo(() => {
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const out = new Set<string>();
    const k = view.k;
    const pri = (n: SimNode) =>
      n.id === focus ? 0 : neighbours.get(focus ?? "")?.has(n.id) ? 1 : n.label === "Service" ? 2 : n.label === "Advisory" ? 3 : n.label === "Lockfile" && graph.n.length < 60 ? 4 : 9;
    const cands = graph.n.filter((n) => pri(n) < 9).sort((a, b) => pri(a) - pri(b) || (graph.deg.get(b.id) ?? 0) - (graph.deg.get(a.id) ?? 0));
    for (const n of cands) {
      const text = clip(short(n.id));
      const w = (text.length * CHAR) / k + n.r + 6;
      const h = 14 / k;
      const box = { x: (n.x ?? 0) + n.r + 6, y: (n.y ?? 0) - h / 2, w, h };
      const hit = boxes.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y);
      if (!hit || pri(n) <= 1) {
        boxes.push(box);
        out.add(n.id);
      }
    }
    return out;
    // positions change every frame; `frame` (the tick timestamp) is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, focus, view.k, neighbours, frame]);

  const now = frame; // the last tick's timestamp — good enough for the enter pop

  return (
    <>
      <div
        ref={ref}
        className="relative h-[320px] cursor-grab touch-none select-none overflow-hidden overscroll-contain active:cursor-grabbing min-[600px]:h-[430px]"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      >
        <svg ref={svgRef} width={width} height={height} role="img" aria-label="graph neighbourhood" className="block" onClick={() => pick(null)}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {graph.l.map((l, i) => {
              const s = l.source as SimNode;
              const t = l.target as SimNode;
              const off = dim(s) || dim(t);
              const lit = focus != null && (s.id === focus || t.id === focus);
              const danger = l.type === "AFFECTS";
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={danger ? "var(--color-node-advisory)" : lit ? "var(--color-mut)" : "var(--color-dim)"}
                  strokeOpacity={off ? 0.05 : danger ? 0.5 : lit ? 0.7 : 0.22}
                  strokeWidth={lit ? 1.4 : danger ? 1.3 : 1}
                  className="transition-[stroke-opacity,stroke] duration-[250ms] ease-[var(--ease)]"
                />
              );
            })}
            {graph.n.map((n) => {
              const c = LABEL[n.label] ?? LABEL.Version;
              const off = dim(n);
              const isSel = selected === n.id;
              const isFocus = focus === n.id;
              const showLabel = labelled.has(n.id);
              const age = now - n.born; // enter: pop in over 250ms, staggered by index
              const scale = reduce || !frame ? 1 : Math.min(1, Math.max(0.2, age / 250));
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                  onPointerDown={startDrag(n)}
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(isSel ? null : n);
                  }}
                  className="cursor-grab transition-opacity duration-[250ms] ease-[var(--ease)] active:cursor-grabbing"
                  style={{ opacity: off ? 0.32 : 1 }}
                >
                  <g transform={`scale(${scale})`}>
                    {(isSel || isFocus) && <circle r={n.r + 6} fill="none" stroke={c.color} strokeWidth={1} strokeOpacity={isSel ? 0.5 : 0.35} className="animate-[fade_.2s_var(--ease)_both]" />}
                    {isFocus && <circle r={n.r + 12} fill={c.color} fillOpacity={0.08} />}
                    <circle r={n.r} fill={c.color} fillOpacity={0.92} className="transition-[r] duration-[180ms]" />
                    {/* invisible hit target so small nodes are still easy to grab (≥ 16px) */}
                    <circle r={Math.max(n.r + 4, 8)} fill="transparent" />
                  </g>
                  {showLabel && (
                    <text
                      x={n.r + 6}
                      y={3.5}
                      className="pointer-events-none font-mono text-[11.5px]"
                      fill={off ? "var(--color-dim)" : isFocus ? "var(--color-fg)" : "var(--color-mut)"}
                      style={{ paintOrder: "stroke", stroke: "var(--color-card)", strokeWidth: 3, strokeLinejoin: "round" }}
                    >
                      {clip(short(n.id))}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {tip && !dragging && (
          <div
            role="tooltip"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-[7px] border border-border bg-pop px-[9px] py-[7px] font-mono text-[12px] leading-[1.4] text-mut elev animate-[fade_.15s_var(--ease)_both]"
            style={{ left: view.x + (tip.x ?? 0) * view.k, top: view.y + (tip.y ?? 0) * view.k }}
          >
            {short(tip.id)}
            <br />
            <span className="text-dim">
              {LABEL[tip.label]?.kind ?? tip.label.toLowerCase()} · {graph.deg.get(tip.id) ?? 0} edges · drag to move
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
