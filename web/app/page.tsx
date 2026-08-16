import Link from "next/link";
import { ChevronRight, Radar } from "lucide-react";
import { listIncidents, fmtMs, fmtUtc } from "@/lib/incident";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
            <Radar className="size-3.5" strokeWidth={2} /> incident response on a graph
          </div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight md:text-[26px]">
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
          <span className="text-[11px] text-muted-foreground">{incidents.length} composed</span>
        </div>

        {incidents.length === 0 && (
          <div className="rounded-lg border border-border bg-card px-5 py-8 text-center text-[13px] text-muted-foreground">
            No incident composed yet. Add a repository with <code className="text-foreground">make add REPO=owner/repo</code>, then compose one with{" "}
            <code className="text-foreground">make incident ID=GHSA-…</code>.
          </div>
        )}

        {incidents.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <div className="min-w-[860px] divide-y divide-border">
              <div className="grid grid-cols-[minmax(260px,1fr)_repeat(4,72px)_150px_130px_20px] items-center gap-x-4 bg-card/60 px-4 py-2 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>advisory</span>
                <span className="text-right">exposed</span>
                <span className="text-right">while live</span>
                <span className="text-right">act now</span>
                <span className="text-right">unscanned</span>
                <span>published</span>
                <span className="text-right">cold · warm</span>
                <span />
              </div>
              {incidents.map((inc) => (
                <Link
                  key={inc.advisory.key}
                  href={`/incident/${inc.advisory.key}`}
                  className="group grid grid-cols-[minmax(260px,1fr)_repeat(4,72px)_150px_130px_20px] items-center gap-x-4 px-4 py-3 text-[13px] transition-colors hover:bg-card focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/60"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] text-signal-2">{inc.advisory.key}</span>
                      <Badge variant="outline" className="rounded-full font-mono text-[10px] uppercase">
                        {inc.advisory.kind}
                      </Badge>
                      <Badge variant="outline" className={cn("rounded-full font-mono text-[10px] uppercase", sevTone(inc.advisory.severity))}>
                        {inc.advisory.severity}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{inc.advisory.summary}</div>
                  </div>
                  <Num n={inc.headline.services_exposed} />
                  <Num n={inc.headline.resolved_while_live ?? "n/a"} tone="text-l1" />
                  <Num n={inc.headline.reachable_L2} tone="text-l2" />
                  <Num n={inc.headline.unscanned} tone="text-unknown" />
                  <span className="num text-[11.5px] text-muted-foreground">{fmtUtc(inc.advisory.published_at_iso)}</span>
                  <span className="num text-right text-[11.5px] text-muted-foreground">
                    {fmtMs(inc.q1_exposed.timing.cold_ms)} · {fmtMs(inc.q1_exposed.timing.warm_p50_ms)}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-colors group-hover:text-signal" strokeWidth={1.75} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function sevTone(sev: string) {
  const s = sev.toLowerCase();
  return s === "critical" || s === "high" ? "border-l2/40 text-l2" : s === "moderate" || s === "medium" ? "border-l1/40 text-l1" : "";
}

function Num({ n, tone = "" }: { n: number | string; tone?: string }) {
  return <span className={cn("num text-right text-[15px]", n === 0 || n === "n/a" ? "text-muted-foreground" : tone)}>{n}</span>;
}

function Metric({ n, label, tone = "" }: { n: number | string; label: string; tone?: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className={cn("num text-3xl leading-none", tone)}>{n}</dd>
      <dd className="mt-1 text-[11px] text-muted-foreground" aria-hidden>
        {label}
      </dd>
    </div>
  );
}
