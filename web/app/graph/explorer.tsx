"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, MessageSquareCode, MousePointerClick, Network } from "lucide-react";
import { ForceGraph, type GEdge, type GNode } from "./force-graph";
import { cn } from "@/lib/utils";
import { HydraCard, Limits } from "@/app/ui";

type Sample = { nodes: GNode[]; edges: GEdge[]; cypher: string[]; ms: number; limitations: string[] };

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;
const DOT: Record<string, string> = { Service: "#ff6a1a", Lockfile: "#f5b400", Version: "#8b93a7", Package: "#5aa9ff", Advisory: "#ff5c5c", Maintainer: "#2fd07f", File: "#c084fc" };
const strip = (k: string) => k.replace(/^(pkg:npm\/|svc:|npm:|file:|lock:)/, "");

// The one question worth asking about this node, phrased so lib/ask parses it.
function askFor(n: GNode, sample: Sample | null): string | null {
  const key = strip(n.id);
  switch (n.label) {
    case "Package":
      return `typosquats near ${key}`;
    case "Version":
      return `typosquats near ${key.replace(/@[^@]*$/, "")}`;
    case "Advisory":
      return `who resolved ${n.id} while it was live`;
    case "Service": {
      const pkg = sample?.nodes.find((x) => x.label === "Package");
      return pkg ? `what pulls ${strip(pkg.id)} into ${key}` : null;
    }
    default:
      return null;
  }
}

// Pick a service or an advisory; the worker returns a bounded, anchored neighbourhood and the
// browser lays it out. The statements that produced it are shown under the picture.
export function GraphExplorer({ services, initial }: { services: string[]; initial: { service?: string; advisory?: string } }) {
  const [service, setService] = useState(initial.service ?? "");
  const [advisory, setAdvisory] = useState(initial.advisory ?? "");
  const [data, setData] = useState<Sample | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reduced = useReducedMotion();
  const spring = reduced ? { duration: 0 } : SPRING;

  const load = (params: { service?: string; advisory?: string }) => {
    start(async () => {
      setSelected(null);
      setError(null);
      const qs = new URLSearchParams(params.service ? { service: params.service } : { advisory: params.advisory ?? "" });
      const r = await fetch(`/api/graph?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        setData(null);
      } else setData(j);
    });
  };
  useEffect(() => {
    if (initial.service || initial.advisory) load(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const neighbourhood = (n: GNode) => {
    if (n.label === "Service") {
      setService(strip(n.id));
      setAdvisory("");
      load({ service: strip(n.id) });
    } else if (n.label === "Advisory") {
      setService("");
      setAdvisory(n.id);
      load({ advisory: n.id });
    }
  };

  const ask = selected ? askFor(selected, data) : null;
  const field = "h-9 bg-transparent px-3 font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:bg-accent/40";

  return (
    <section className="space-y-3">
      <form
        className={cn("flex h-9 w-fit max-w-full items-stretch overflow-hidden rounded-lg border border-border bg-card elev")}
        onSubmit={(e) => {
          e.preventDefault();
          if (advisory.trim()) {
            setService("");
            load({ advisory: advisory.trim() });
          }
        }}
      >
        <select
          value={service}
          aria-label="service"
          onChange={(e) => {
            setService(e.target.value);
            setAdvisory("");
            if (e.target.value) load({ service: e.target.value });
          }}
          className={cn(field, "min-w-0 max-w-64 cursor-pointer")}
        >
          <option value="">— pick a service —</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="grid place-items-center border-l border-border px-2.5 text-[11px] text-muted-foreground" aria-hidden>
          or
        </span>
        <input
          value={advisory}
          aria-label="advisory"
          onChange={(e) => setAdvisory(e.target.value)}
          placeholder="GHSA-… / MAL-…"
          className={cn(field, "w-44 border-l border-border md:w-52")}
        />
        <button
          type="submit"
          disabled={pending || !advisory.trim()}
          className="inline-flex h-9 items-center gap-1.5 border-l border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.96]"
        >
          <span className="grid size-4 place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={pending ? "busy" : "idle"}
                initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                transition={spring}
                className="grid"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </span>
          show
        </button>
      </form>

      {error && <div className="rounded-lg border border-l2/40 bg-l2/5 px-3 py-2 text-[12.5px] text-l2">{error}</div>}

      <div className={cn("grid gap-3", data && data.nodes.length > 0 && "lg:grid-cols-[minmax(0,1fr)_260px]")}>
        <div className="min-w-0">
          {pending ? (
            <LayingOut nodes={data?.nodes.length} edges={data?.edges.length} />
          ) : data && data.nodes.length > 0 ? (
            <ForceGraph nodes={data.nodes} edges={data.edges} selected={selected?.id ?? null} onSelect={setSelected} />
          ) : (
            !error && (
              <div className={cn("flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-[13px] text-muted-foreground")}>
                <span className="grid size-10 place-items-center rounded-full bg-muted">
                  <Network className="size-4" strokeWidth={1.75} />
                </span>
                <p className="text-pretty text-center">
                  {data ? "nothing in the neighbourhood yet — advisories may not be ingested" : "pick a service or an advisory to render its neighbourhood"}
                </p>
              </div>
            )
          )}
        </div>

        {data && data.nodes.length > 0 && !pending && (
          <aside className={cn("rounded-xl border border-border bg-card p-3 elev")} aria-label="selected node">
            <AnimatePresence mode="wait" initial={false}>
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 3, transition: { duration: 0.15 } }}
                  transition={spring}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: DOT[selected.label] ?? DOT.Version }} aria-hidden />
                    {selected.label}
                  </div>
                  <div className="break-all font-mono text-[12.5px] leading-snug text-foreground">{selected.id}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {selected.sha && (
                      <>
                        <dt>sha</dt>
                        <dd className="num truncate">{selected.sha}</dd>
                      </>
                    )}
                    {selected.kind && (
                      <>
                        <dt>kind</dt>
                        <dd className="font-mono">
                          {selected.kind} · {selected.severity ?? "n/a"}
                        </dd>
                      </>
                    )}
                    <dt>edges</dt>
                    <dd className="num">{data.edges.filter((e) => e.s === selected.id || e.t === selected.id).length}</dd>
                  </dl>
                  <div className="flex flex-col gap-1.5 pt-1">
                    {ask && (
                      <Link
                        href={`/ask?q=${encodeURIComponent(ask)}`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-signal/40 bg-signal/10 px-3 text-[12px] text-foreground transition-colors hover:bg-signal/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.96]"
                      >
                        <MessageSquareCode className="size-3.5 shrink-0 text-signal" strokeWidth={1.75} />
                        <span className="truncate">open in Ask</span>
                      </Link>
                    )}
                    {(selected.label === "Service" || selected.label === "Advisory") && (
                      <button
                        type="button"
                        onClick={() => neighbourhood(selected)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:border-signal/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.96]"
                      >
                        <Network className="size-3.5 shrink-0" strokeWidth={1.75} />
                        show neighbourhood
                      </button>
                    )}
                    {ask && <p className="text-pretty text-[10.5px] text-muted-foreground">asks: “{ask}”</p>}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="none"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 3, transition: { duration: 0.15 } }}
                  transition={spring}
                  className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-[12px] text-muted-foreground"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-muted">
                    <MousePointerClick className="size-4" strokeWidth={1.75} />
                  </span>
                  <p className="text-pretty">click a node to inspect it</p>
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        )}
      </div>

      {data && data.nodes.length > 0 && !pending && (
        <>
          <HydraCard title="graph neighbourhood" cypher={data.cypher} ms={data.ms} rows={data.nodes.length} />
          <Limits items={data.limitations} />
        </>
      )}
    </section>
  );
}

// Skeleton canvas while the worker walks the graph. Counts of the previous sample stay visible
// so the frame does not blank between two neighbourhoods.
function LayingOut({ nodes, edges }: { nodes?: number; edges?: number }) {
  return (
    <div
      role="status"
      className={cn(
        "relative grid h-[480px] place-items-center overflow-hidden rounded-xl border border-border bg-card",
        "bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:24px_24px]",
        "elev",
      )}
    >
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-signal" />
        laying out…
      </div>
      <div className="pointer-events-none absolute right-3 top-2 num text-[10.5px] text-muted-foreground">
        {nodes == null ? "… nodes · … edges" : `${nodes} nodes · ${edges} edges`}
      </div>
    </div>
  );
}
