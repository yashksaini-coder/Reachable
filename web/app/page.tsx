import Link from "next/link";
import { ArrowUpRight, Clock, GitCommitHorizontal, Radar } from "lucide-react";
import { listIncidents, fmtMs, fmtUtc } from "@/lib/incident";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "./ui";

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
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-signal">
            <Radar className="size-3.5" strokeWidth={2} /> incident response on a graph
          </div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-[36px]">
            Everyone else ships more alerts. <span className="text-signal">We ship fewer, with proof.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">
            When an npm package is compromised: which of your services are transitively exposed, which resolved the bad
            version <em className="text-foreground/90 not-italic">while it was live</em>, which packages share its maintainers,
            which nearby names are typosquats — and which exposures are actually reachable from first-party code. Each answer
            is one traversal inside HydraDB, with the executed Cypher shown under it.
          </p>
          <div className="mt-6 grid max-w-xl grid-cols-3 gap-3">
            <Metric n={totals.exposed} label="services exposed" />
            <Metric n={totals.live} label="resolved while live" tone="text-l1" />
            <Metric n={totals.l2} label="reachable · act now" tone="text-l2" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Incidents</h2>
          <span className="text-[11px] text-muted-foreground">{incidents.length} composed</span>
        </div>
        {incidents.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No incident composed yet. Run <code className="text-foreground">make incident ID=… ARGS=&quot;--out&quot;</code>.
            </CardContent>
          </Card>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {incidents.map((inc) => (
            <Link key={inc.advisory.key} href={`/incident/${inc.advisory.key}`} className="group block focus-visible:outline-none">
              <Card className="h-full transition-colors group-hover:border-signal/60 group-focus-visible:border-signal">
                <CardContent className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] text-signal-2">{inc.advisory.key}</span>
                        <Badge variant="outline" className="rounded-full font-mono text-[10px] uppercase">
                          {inc.advisory.kind} · {inc.advisory.severity}
                        </Badge>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[13.5px] text-muted-foreground">{inc.advisory.summary}</div>
                    </div>
                    <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-signal" strokeWidth={1.75} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric n={inc.headline.services_exposed} label="exposed" small />
                    <Metric n={inc.headline.resolved_while_live ?? "n/a"} label="while live" tone="text-l1" small />
                    <Metric n={inc.headline.reachable_L2} label="act now" tone="text-l2" small />
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" strokeWidth={1.75} /> published {fmtUtc(inc.advisory.published_at_iso)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <GitCommitHorizontal className="size-3" strokeWidth={1.75} />
                      blast radius {fmtMs(inc.q1_exposed.timing.cold_ms)} cold · {fmtMs(inc.q1_exposed.timing.warm_p50_ms)} warm
                    </span>
                    {inc.headline.unscanned > 0 && <Chip>{inc.headline.unscanned} unscanned</Chip>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Principle title="Lockfile is a node">
          Exposure is a fact <em>as of a commit</em>. Every <code>package-lock.json</code> snapshot is a time-stamped node whose
          RESOLVED edges are the flattened tree npm actually installed — so “who resolved it while it was live” is one
          predicate comparing two relationship properties, in-engine.
        </Principle>
        <Principle title="One call, many sources">
          <code>algo.MSpaths</code> takes every compromised version and every service in a single reverse traversal. No
          client-side fan-out; the proving path comes back from the engine.
        </Principle>
        <Principle title="Honest windows">
          <code>live_from</code> is exact — npm keeps the publish timestamp after erasing a version. <code>live_to</code> is an
          upper bound and is labelled as one on every row. Unknowns are shown as unknown.
        </Principle>
      </section>
    </div>
  );
}

function Metric({ n, label, tone = "", small = false }: { n: number | string; label: string; tone?: string; small?: boolean }) {
  return (
    <div className={small ? "" : "rounded-lg border border-border bg-background/60 px-3 py-2.5"}>
      <div className={`num leading-none ${small ? "text-2xl" : "text-3xl"} ${tone}`}>{n}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Principle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 text-[13px] leading-relaxed text-muted-foreground">
      <h3 className="mb-1 font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}
