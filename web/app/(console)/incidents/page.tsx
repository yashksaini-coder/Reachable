import { Radar } from "lucide-react";
import { listIncidents } from "@/lib/incident";
import { IncidentRows, Metric, type IncidentRow } from "./home-client";

export const dynamic = "force-static";

export default async function Home() {
  const incidents = await listIncidents();
  const totals = incidents.reduce(
    (a, i) => ({
      exposed: a.exposed + i.headline.services_exposed,
      live: a.live + (i.headline.resolved_while_live ?? 0),
      l2: a.l2 + i.headline.reachable_L2,
    }),
    { exposed: 0, live: 0, l2: 0 },
  );
  // Only the fields the rows render cross the server/client boundary.
  const rows: IncidentRow[] = incidents.map((i) => ({
    key: i.advisory.key,
    kind: i.advisory.kind,
    severity: i.advisory.severity,
    summary: i.advisory.summary,
    published_at_iso: i.advisory.published_at_iso,
    exposed: i.headline.services_exposed,
    live: i.headline.resolved_while_live,
    l2: i.headline.reachable_L2,
    unscanned: i.headline.unscanned,
    cold_ms: i.q1_exposed.timing.cold_ms,
    warm_ms: i.q1_exposed.timing.warm_p50_ms,
  }));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-[52ch]">
          <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
            <Radar className="size-3.5" strokeWidth={2} /> incident response on a graph
          </div>
          <h1 className="text-balance text-[22px] font-semibold leading-tight tracking-tight md:text-[26px]">
            Which services are exposed, which resolved it while it was live, which need action — one traversal each.
          </h1>
        </div>
        <dl className="flex gap-6">
          <Metric n={totals.exposed} label="services exposed" />
          <Metric n={totals.live} label="resolved while live" tone="text-l1" />
          <Metric n={totals.l2} label="reachable · act now" tone="text-l2" />
        </dl>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Incidents</h2>
          <span className="num text-[11px] text-muted-foreground">{incidents.length} composed</span>
        </div>

        {incidents.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-border bg-card px-5 py-10 text-center elev">
            <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
              <Radar className="size-4" strokeWidth={1.75} />
            </span>
            <p className="mt-3 text-pretty text-[13px] text-foreground">No incident composed yet.</p>
            <p className="mt-1 text-pretty text-[12.5px] text-muted-foreground">Add a repository, then compose one from an advisory id.</p>
            <code className="mt-4 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground">
              make add REPO=owner/repo &amp;&amp; make incident ID=GHSA-…
            </code>
          </div>
        ) : (
          <IncidentRows rows={rows} />
        )}
      </section>
    </div>
  );
}
