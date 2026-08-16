"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Network } from "lucide-react";
import { ForceGraph, type GEdge, type GNode } from "./force-graph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HydraCard, Limits } from "@/app/ui";

type Sample = { nodes: GNode[]; edges: GEdge[]; cypher: string[]; ms: number; limitations: string[] };

// Pick a service or an advisory; the worker returns a bounded, anchored neighbourhood and the
// browser lays it out. The statements that produced it are shown under the picture.
export function GraphExplorer({ services, initial }: { services: string[]; initial: { service?: string; advisory?: string } }) {
  const [service, setService] = useState(initial.service ?? "");
  const [advisory, setAdvisory] = useState(initial.advisory ?? "");
  const [data, setData] = useState<Sample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (params: { service?: string; advisory?: string }) => {
    start(async () => {
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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          service
          <select
            value={service}
            onChange={(e) => {
              setService(e.target.value);
              setAdvisory("");
              if (e.target.value) load({ service: e.target.value });
            }}
            className="h-9 min-w-56 rounded-md border border-input bg-card px-2 font-mono text-[12.5px] text-foreground focus:border-signal/60 focus:outline-none"
          >
            <option value="">— pick a service —</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-[11px] text-muted-foreground">or</span>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (advisory.trim()) {
              setService("");
              load({ advisory: advisory.trim() });
            }
          }}
        >
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            advisory
            <Input value={advisory} onChange={(e) => setAdvisory(e.target.value)} placeholder="GHSA-… / MAL-…" className="h-9 w-56 font-mono text-[12.5px]" />
          </label>
          <Button type="submit" variant="outline" size="sm" className="h-9" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
            show
          </Button>
        </form>
      </div>
      {error && <div className="rounded-lg border border-l2/40 bg-l2/5 px-3 py-2 text-[12.5px] text-l2">{error}</div>}
      {data && data.nodes.length > 0 ? (
        <>
          <ForceGraph nodes={data.nodes} edges={data.edges} />
          <HydraCard title="graph neighbourhood" cypher={data.cypher} ms={data.ms} rows={data.nodes.length} />
          <Limits items={data.limitations} />
        </>
      ) : (
        !pending &&
        !error && (
          <div className="grid h-48 place-items-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground">
            {data ? "nothing in the neighbourhood yet — advisories may not be ingested" : "pick a service or an advisory to render its neighbourhood"}
          </div>
        )
      )}
    </section>
  );
}
