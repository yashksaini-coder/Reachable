import Link from "next/link";
import { ChevronRight, Radar } from "lucide-react";
import { listIncidents, fmtMs, fmtUtc, type Incident } from "@/lib/incident";
import { Chip, Kind, Level, SectionLabel, Stat, StatStrip } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";

// Worst verdict an incident reached across its services; null when nothing is exposed.
function worstLevel(h: Incident["headline"]): string | null {
  if (h.reachable_L2 > 0) return "L2";
  if (h.imported_L1 > 0) return "L1";
  if (h.present_only_L0 > 0) return "L0";
  if (h.unscanned > 0) return "unscanned";
  return null;
}

// Inline 46x12 latency sparkline from the measured points only (cold, warm p50, warm p95).
// Fewer than two measured values → nothing to draw; never invent a point.
function Sparkline({ values }: { values: (number | null)[] }) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const max = Math.max(...v) || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * 46).toFixed(1)},${(12 - (y / max) * 12).toFixed(1)}`).join(" ");
  return (
    <svg width="46" height="12" viewBox="0 0 46 12" className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" className="stroke-signal" strokeOpacity={0.65} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  const incidents = (await listIncidents()).sort(
    (a, b) => b.headline.reachable_L2 - a.headline.reachable_L2 || b.headline.services_exposed - a.headline.services_exposed,
  );
  const totals = incidents.reduce(
    (a, i) => ({ exposed: a.exposed + i.headline.services_exposed, l2: a.l2 + i.headline.reachable_L2, unscanned: a.unscanned + i.headline.unscanned }),
    { exposed: 0, l2: 0, unscanned: 0 },
  );
  // Watched-service count from the newest report's graph snapshot; omitted when the count was rejected.
  const newest = [...incidents].sort((a, b) => b.provenance.generated_at.localeCompare(a.provenance.generated_at))[0];
  const watching = newest?.provenance.graph.Service ?? null;

  return (
    <div className="mx-auto max-w-[1280px] px-10 py-[52px] pb-[72px] max-[900px]:px-5">
      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-end gap-14 animate-[en_.3s_var(--ease)_both] max-[900px]:grid-cols-1 max-[900px]:gap-8">
        <div>
          <div className="mb-[18px] flex items-center gap-2">
            <span className="size-[5px] rounded-full bg-signal" aria-hidden />
            <span className="text-[10.5px] font-medium uppercase leading-none tracking-[0.11em] text-signal">
              supply chain{watching != null && <> · watching {watching} services</>}
            </span>
          </div>
          <h1 className="max-w-[15ch] text-balance text-[30px] font-medium leading-[1.22] tracking-[-0.02em] text-fg">Compromised packages, and who they reached.</h1>
          <p className="mt-4 max-w-[52ch] text-[13px] text-mut">Six answers per incident, each carrying the statement that produced it. Verdicts are computed, never inferred.</p>
        </div>
        <StatStrip min={132}>
          <Stat n={totals.l2} label="act now" rule="bg-l2" tone="text-l2" size="lg" />
          <Stat n={totals.exposed} label="services exposed" rule="bg-signal" size="lg" delay={90} />
          <Stat n={totals.unscanned} label="unscanned" rule="bg-unknown" tone="text-unknown" size="lg" delay={180} />
        </StatStrip>
      </div>

      <SectionLabel className="mb-3 mt-11" note="sorted by act-now count">
        open incidents
      </SectionLabel>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-border bg-card px-5 py-10 text-center elev">
          <span className="grid size-10 place-items-center rounded-full bg-card2 text-mut">
            <Radar className="size-4" strokeWidth={1.75} />
          </span>
          <p className="mt-3 text-pretty text-[13px] text-fg">No incident composed yet.</p>
          <p className="mt-1 text-pretty text-[12.5px] text-mut">Add a repository, then compose one from an advisory id.</p>
          <code className="mt-4 rounded-md border border-line bg-code px-3 py-2 font-mono text-[12px] text-signal-2">make add REPO=owner/repo &amp;&amp; make incident ID=GHSA-…</code>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card elev">
          {incidents.map((i) => {
            const h = i.headline;
            const t = i.q1_exposed.timing;
            const level = worstLevel(h);
            return (
              <Link
                key={i.advisory.key}
                href={`/incident/${i.advisory.key}`}
                className="group block w-full border-b border-line px-5 py-[18px] transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50"
              >
                <div className="flex items-start gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-[13px] font-medium leading-none text-signal">{i.advisory.key}</span>
                      {level ? <Level level={level} /> : <Chip>none exposed</Chip>}
                      <Kind kind={i.advisory.kind} />
                      <Chip>{i.advisory.severity}</Chip>
                    </div>
                    <div className="mt-[9px] max-w-[76ch] text-pretty text-[13px] text-fg">{i.advisory.summary}</div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] leading-[1.2] text-dim">
                      <span>
                        exposed <span className="text-mut">{h.services_exposed}</span>
                      </span>
                      <span>
                        while live <Meaning n={h.resolved_while_live} tone="text-l1" />
                      </span>
                      <span>
                        act now <Meaning n={h.reachable_L2} tone="text-l2" />
                      </span>
                      <span>
                        unscanned <Meaning n={h.unscanned} tone="text-unknown" />
                      </span>
                      <span>
                        published <span className="text-mut">{fmtUtc(i.advisory.published_at_iso)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        cold {fmtMs(t.cold_ms)} · warm {fmtMs(t.warm_p50_ms)} <Sparkline values={[t.cold_ms, t.warm_p50_ms, t.warm_p95_ms]} />
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-dim transition-transform duration-[180ms] ease-[var(--ease)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                </div>
              </Link>
            );
          })}
          <div className="px-5 py-3.5 font-mono text-[11px] leading-[1.3] text-dim">
            {incidents.length} composed{newest && <> · reports generated {fmtUtc(newest.provenance.generated_at)}</>}
          </div>
        </div>
      )}
    </div>
  );
}

// A metadata value coloured by meaning only when it means something: a zero (or a CVE's n/a
// while-live, which the worker leaves null) stays --mut, so a page with no L2 has no red.
function Meaning({ n, tone }: { n: number | null; tone: string }) {
  return <span className={cn(n ? tone : "text-mut")}>{n == null ? "n/a" : n}</span>;
}
