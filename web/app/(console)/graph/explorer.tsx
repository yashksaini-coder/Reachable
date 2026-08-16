"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Network, X } from "lucide-react";
import { ForceGraph, LABEL, type GEdge, type GNode } from "./force-graph";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/console/toast";
import { HydraCard, Limits } from "@/components/console/ui";

type Sample = { nodes: GNode[]; edges: GEdge[]; cypher: string[]; ms: number; limitations: string[] };

const SEEDS = ["service", "lockfile", "package", "advisory", "all"] as const;
const strip = (k: string) => k.replace(/^(pkg:npm\/|svc:|npm:|file:|lock:)/, "");
const HIT = "relative before:absolute before:-inset-1 before:content-['']";

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
  const [seed, setSeed] = useState<(typeof SEEDS)[number]>("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const load = (params: { service?: string; advisory?: string }) => {
    start(async () => {
      setSelected(null);
      setError(null);
      const qs = new URLSearchParams(params.service ? { service: params.service } : { advisory: params.advisory ?? "" });
      try {
        const r = await fetch(`/api/graph?${qs}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? `HTTP ${r.status}`);
          setData(null);
          toast.error("the neighbourhood could not be loaded", j.error ?? `HTTP ${r.status}`);
        } else setData(j);
      } catch {
        setError("live API unavailable");
        setData(null);
        toast.error("live API unavailable", "the worker on :8787 did not answer — start it with make up");
      }
    });
  };
  useEffect(() => {
    if (initial.service || initial.advisory) load(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Escape closes the side panel.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

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
  const sel = selected ? (LABEL[selected.label] ?? LABEL.Version) : null;
  const facts: [string, string][] = selected
    ? [
        ["edges", String(data?.edges.filter((e) => e.s === selected.id || e.t === selected.id).length ?? 0)],
        ["label", selected.label],
        ...(selected.sha ? ([["sha", selected.sha]] as [string, string][]) : []),
        ...(selected.kind ? ([["kind", `${selected.kind} · ${selected.severity ?? "n/a"}`]] as [string, string][]) : []),
      ]
    : [];
  const field = "h-10 min-w-0 bg-transparent px-2.5 font-mono text-[11.5px] text-fg placeholder:text-dim focus:outline-none focus-visible:bg-hover";
  const has = !!data && data.nodes.length > 0;

  return (
    <section className="space-y-3.5">
      <div className="overflow-hidden rounded-2xl border border-border bg-[linear-gradient(180deg,var(--color-card),var(--color-code))] elev">
        {/* header: seed chips (highlight one kind) + the picker that fetches the neighbourhood */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5">
          <span className="label mr-1.5">seed</span>
          {SEEDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={seed === k}
              onClick={() => setSeed(k)}
              className={cn(
                "min-h-10 rounded-[7px] border px-[11px] font-mono text-[11.5px] leading-none transition-[background-color,color,border-color] duration-[180ms] ease-[var(--ease)] active:scale-[0.97]",
                seed === k ? "border-signal/40 bg-sigfill text-signal" : "border-border text-mut hover:bg-hover hover:text-fg",
                HIT,
              )}
            >
              {k}
            </button>
          ))}

          <form
            className="ml-auto flex h-10 max-w-full items-stretch overflow-hidden rounded-[7px] border border-border bg-card"
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
              className={cn(field, "max-w-56 cursor-pointer")}
            >
              <option value="">— pick a service —</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="grid place-items-center border-l border-border px-2 text-[10.5px] text-dim" aria-hidden>
              or
            </span>
            <input value={advisory} aria-label="advisory" onChange={(e) => setAdvisory(e.target.value)} placeholder="GHSA-… / MAL-…" className={cn(field, "w-40 border-l border-border")} />
            <button
              type="submit"
              disabled={pending || !advisory.trim()}
              className={cn(
                "inline-flex items-center gap-1.5 border-l border-border px-2.5 text-[11.5px] font-medium text-mut transition-[background-color,color] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                HIT,
              )}
            >
              {pending ? <Loader2 className="size-3.5 animate-spin text-signal" /> : <Network className="size-3.5" />}
              show
            </button>
          </form>
        </div>

        {pending ? (
          <Canvas role="status">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-signal" />
              laying out…
            </span>
            {data && (
              <span className="num text-[10.5px] text-dim">
                {data.nodes.length} nodes · {data.edges.length} edges
              </span>
            )}
          </Canvas>
        ) : has ? (
          <ForceGraph nodes={data.nodes} edges={data.edges} seed={seed} selected={selected?.id ?? null} onSelect={setSelected}>
            {selected && sel && (
              <aside
                aria-label="selected node"
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute bottom-3 right-3 top-3 flex w-[244px] max-w-[calc(100%-24px)] cursor-auto select-text flex-col rounded-md border border-border bg-pop p-3.5 elev animate-[en_.25s_var(--ease)_both]"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-[7px]">
                      <span className={cn("size-1.5 rounded-full", sel.bg)} aria-hidden />
                      <span className="label">{sel.kind}</span>
                    </div>
                    <div className="mt-[9px] break-all font-mono text-[12.5px] leading-[1.4] text-fg">{selected.id}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="close"
                    className={cn("-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-dim transition-[background-color,color] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg", "before:-inset-1.5", HIT)}
                  >
                    <X className="size-[13px]" />
                  </button>
                </div>
                <dl className="mt-3.5 flex flex-col gap-2 font-mono text-[11px] leading-[1.4] text-dim">
                  {facts.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2.5">
                      <dt>{k}</dt>
                      <dd className="num min-w-0 truncate text-mut">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex-1" />
                <div className="mt-3.5 flex flex-col gap-1.5">
                  {ask && (
                    <Link
                      href={`/ask?q=${encodeURIComponent(ask)}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-signal/40 text-[11.5px] font-medium leading-none text-signal transition-[background-color] duration-[180ms] ease-[var(--ease)] hover:bg-sigfill active:scale-[0.97]"
                    >
                      ask about this →
                    </Link>
                  )}
                  {(selected.label === "Service" || selected.label === "Advisory") && (
                    <button
                      type="button"
                      onClick={() => neighbourhood(selected)}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border text-[11.5px] font-medium leading-none text-mut transition-[background-color,color] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg active:scale-[0.97]"
                    >
                      show neighbourhood
                    </button>
                  )}
                </div>
              </aside>
            )}
          </ForceGraph>
        ) : (
          <Canvas>
            <span className="grid size-11 place-items-center rounded-full border border-border text-dim">
              <Network className="size-[17px]" />
            </span>
            <p className="max-w-[44ch] text-pretty text-center text-[13px] text-mut">
              {error ? "The worker could not return this neighbourhood." : data ? "Nothing in the neighbourhood yet — advisories may not be ingested." : "Pick a service or an advisory to render its neighbourhood."}
            </p>
            {error && <p className="font-mono text-[11px] text-l1">{error}</p>}
          </Canvas>
        )}
      </div>

      {has && !pending && (
        <>
          <HydraCard title="graph neighbourhood" cypher={data.cypher} ms={data.ms} rows={data.nodes.length} flat />
          <Limits items={data.limitations} />
        </>
      )}
    </section>
  );
}

// The 430px canvas in its non-graph states (loading / empty / error): centred, one sentence.
function Canvas({ children, role }: { children: React.ReactNode; role?: string }) {
  return (
    <div role={role} className="flex h-[430px] flex-col items-center justify-center gap-3 px-6 text-[12px] text-mut">
      {children}
    </div>
  );
}
