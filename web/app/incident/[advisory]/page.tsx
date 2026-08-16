import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { readIncident, listIncidents, short, svcSlug, fmtMs, fmtUtc, type Incident } from "@/lib/incident";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HydraCard, Kind, Level, Limits, SectionTitle, Stat, Chip, ELEV } from "@/app/ui";
import { cn } from "@/lib/utils";
import { Timeline } from "./timeline";
import { BlastGraph } from "./graph";
import { Rail } from "./rail";
import { Reveal } from "./reveal";

export const dynamic = "force-static";
export async function generateStaticParams() {
  return (await listIncidents()).map((i) => ({ advisory: i.advisory.key }));
}
export async function generateMetadata({ params }: PageProps<"/incident/[advisory]">) {
  const { advisory } = await params;
  return { title: advisory };
}

const rank = (inc: Incident, svc: string) => ({ L2: 3, L1: 2, unscanned: 1, L0: 0 })[inc.q7_reachability[svc]?.level ?? "unscanned"] ?? 0;
const advisoryUrl = (id: string) => (id.startsWith("GHSA-") ? `https://github.com/advisories/${id}` : `https://osv.dev/vulnerability/${id}`);

export default async function IncidentPage({ params }: PageProps<"/incident/[advisory]">) {
  const { advisory } = await params;
  const inc = await readIncident(advisory);
  if (!inc) notFound();
  const h = inc.headline;
  const q1 = inc.q1_exposed;
  const q3 = inc.q3_while_live;
  const byService = new Map<string, typeof q1.rows>();
  for (const r of q1.rows) byService.set(r.service, [...(byService.get(r.service) ?? []), r]);
  const services = [...byService.keys()].sort((a, b) => rank(inc, b) - rank(inc, a) || a.localeCompare(b));

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_120px] md:gap-8">
      <div className="min-w-0 space-y-10">
        <header className="space-y-4">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1 rounded-md text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
          >
            <ArrowLeft className="size-3.5" /> incidents
          </Link>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-mono text-2xl text-signal-2">{inc.advisory.key}</h1>
            <Badge variant="outline" className="rounded-full font-mono text-[10px] uppercase">
              {inc.advisory.kind} · {inc.advisory.severity}
            </Badge>
            <span className="text-xs text-muted-foreground">published {fmtUtc(inc.advisory.published_at_iso)}</span>
            <a
              href={advisoryUrl(inc.advisory.key)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
            >
              source <ExternalLink className="size-3" />
            </a>
          </div>
          <p className="max-w-3xl text-pretty text-[14px] text-foreground/90">{inc.advisory.summary}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat n={h.services_exposed} label="services exposed" />
            <Stat n={h.resolved_while_live} label="resolved while live" tone="text-l1" />
            <Stat n={h.reachable_L2} label="reachable · L2 · act now" tone="text-l2" />
            <Stat n={h.imported_L1} label="imported · L1" tone="text-l1/80" />
            <Stat n={h.present_only_L0} label="present only · L0" tone="text-l0" />
            <Stat n={h.unscanned} label="unscanned" tone="text-unknown" />
          </div>
        </header>

        <BlastGraph inc={inc} />

        <section id="q1" className="scroll-mt-6">
          <Reveal>
            <SectionTitle n="1" title="Which services are transitively exposed?" />
          </Reveal>
          <Reveal delay={0.08} className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>service</TableHead>
                  <TableHead>verdict</TableHead>
                  <TableHead className="text-right">lockfiles</TableHead>
                  <TableHead>pulled in via</TableHead>
                  <TableHead>latest exposed commit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((svc) => {
                  const rows = byService.get(svc)!;
                  const latest = rows[0];
                  return (
                    <TableRow key={svc}>
                      <TableCell className="font-mono">
                        <Link
                          href={`/incident/${inc.advisory.key}/${svcSlug(svc)}`}
                          className="rounded-sm transition-colors hover:text-signal-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                        >
                          {svcSlug(svc)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Level level={inc.q7_reachability[svc]?.level ?? "unscanned"} />
                      </TableCell>
                      <TableCell className="num text-right text-muted-foreground">{rows.length}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {latest.via ? (
                          <>
                            <span className="text-foreground/90">{short(latest.via)}</span> · {latest.hops} hop{latest.hops === 1 ? "" : "s"}
                          </>
                        ) : (
                          "direct dependency"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {latest.sha.slice(0, 12)} · {fmtUtc(new Date(latest.committed_at * 1000).toISOString())}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {services.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No watched service resolved an affected version.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Reveal>
          <HydraCard title="who is exposed" cypher={q1.cypher} ms={q1.ms} rows={q1.rows.length} timing={q1.timing} />
          {inc.q1_mspaths.cypher.length > 0 && (
            <HydraCard
              title={`blast radius in one call — ${inc.q1_mspaths.sources ?? "?"} versions × ${inc.q1_mspaths.targets ?? "?"} services`}
              cypher={inc.q1_mspaths.cypher}
              ms={inc.q1_mspaths.ms}
              rows={inc.q1_mspaths.rows.length}
              truncated={inc.q1_mspaths.truncated}
              timing={inc.q1_mspaths.timing}
            />
          )}
          <Limits items={q1.limitations} />
        </section>

        <section id="q2" className="scroll-mt-6">
          <Reveal>
            <SectionTitle n="2" title="Which version introduced it?" />
          </Reveal>
          <Reveal delay={0.08} className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>version</TableHead>
                  <TableHead>published (exact)</TableHead>
                  <TableHead>live until</TableHead>
                  <TableHead>registry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inc.q2_versions.rows.slice(0, 40).map((r) => (
                  <TableRow key={r.version}>
                    <TableCell className="font-mono">
                      {short(r.version)}
                      {inc.q2_versions.first?.version === r.version && <Chip tone="ml-2 border-signal/40 text-signal-2">first</Chip>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fmtUtc(r.published_at_iso)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.live_to_kind === "unbounded" ? "still live" : fmtUtc(r.live_to_iso)} <Kind kind={r.live_to_kind} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.removed ? <span className="text-l2">removed</span> : <span className="text-muted-foreground">present</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {inc.q2_versions.rows.length > 40 && (
              <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                {inc.q2_versions.rows.length - 40} more affected versions in the JSON.
              </div>
            )}
          </Reveal>
          <HydraCard title="which version" cypher={inc.q2_versions.cypher} ms={inc.q2_versions.ms} rows={inc.q2_versions.rows.length} />
          <Limits items={inc.q2_versions.limitations} />
        </section>

        <section id="q3" className="scroll-mt-6">
          <Reveal>
            <SectionTitle n="3" title="Which apps resolved the bad version while it was live?" star />
          </Reveal>
          {q3 === null ? (
            <div className="rounded-lg border border-border bg-card p-4 text-pretty text-sm text-muted-foreground">
              Not applicable: this is a CVE — the artifact is still on the registry, so exposure is not time-bounded and “resolved while live” collapses into
              “resolved at all” (question 1).
            </div>
          ) : (
            <>
              <Timeline rows={q3.rows} versions={inc.q2_versions.rows} advisoryPublished={inc.advisory.published_at} />
              <Reveal delay={0.08} className="mt-3 overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>service</TableHead>
                      <TableHead>lockfile committed</TableHead>
                      <TableHead>version</TableHead>
                      <TableHead>evidence</TableHead>
                      <TableHead>window</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q3.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">
                          <Link
                            href={`/incident/${inc.advisory.key}/${svcSlug(r.service)}`}
                            className="rounded-sm transition-colors hover:text-signal-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                          >
                            {svcSlug(r.service)}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.sha.slice(0, 12)} · {fmtUtc(r.resolved_at_iso)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{short(r.version)}</TableCell>
                        <TableCell className="text-xs">
                          {r.evidence.includes("in_window") && <span className="mr-2 text-l1">in window</span>}
                          {r.evidence.includes("pinned_removed") && <span className="text-l2">pins a removed version</span>}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {fmtUtc(r.live_from_iso)} → {fmtUtc(r.live_to_iso)} <Kind kind={r.live_to_kind} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {q3.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No watched lockfile was committed inside the window or pins a removed version.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Reveal>
              <HydraCard title="resolved while live" cypher={q3.cypher} ms={q3.ms} rows={q3.rows.length} />
              <Limits items={[q3.note ?? "", ...q3.limitations].filter(Boolean)} />
            </>
          )}
        </section>

        <section id="q4" className="scroll-mt-6">
          <Reveal>
            <SectionTitle n="4" title="Which packages share maintainers or infrastructure?" star />
          </Reveal>
          <Reveal delay={0.08} className="mb-3 flex flex-wrap gap-2">
            {inc.q4_maintainers.maintainers.map((m) => (
              <Chip key={m.login}>
                {short(m.login)} · 2FA {m.twofa === null ? "unknown" : m.twofa ? "on" : "off"}
              </Chip>
            ))}
          </Reveal>
          <Reveal delay={0.16} className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>co-maintained package</TableHead>
                  <TableHead className="text-right">weekly downloads</TableHead>
                  <TableHead>services resolving it today</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inc.q4_maintainers.rows.slice(0, 15).map((r) => (
                  <TableRow key={r.package}>
                    <TableCell className="font-mono">{short(r.package)}</TableCell>
                    <TableCell className="num text-right text-xs text-muted-foreground">{r.downloads?.toLocaleString() ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="num mr-2">{r.services_at_risk.length}</span>
                      <span className="text-muted-foreground">{r.services_at_risk.map(svcSlug).join(", ")}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Reveal>
          <HydraCard title="maintainer fan-out" cypher={inc.q4_maintainers.cypher} ms={inc.q4_maintainers.ms} rows={inc.q4_maintainers.rows.length} />
          <Limits items={inc.q4_maintainers.limitations} />
        </section>

        <section id="q5" className="scroll-mt-6">
          <Reveal>
            <SectionTitle n="5" title="Are there likely typosquats nearby?" star />
          </Reveal>
          {Object.entries(inc.q5_typosquats).map(([pkg, sec], i) => (
            <Reveal key={pkg} delay={0.08 + i * 0.06} className="mb-4">
              <div className="mb-1.5 font-mono text-xs text-muted-foreground">near {short(pkg)}</div>
              {sec.rows.length === 0 ? (
                <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">no near-names in the ingested corpus</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sec.rows.slice(0, 12).map((r) => (
                    <Chip key={r.package}>
                      {short(r.package)} · {r.kind} · d{r.distance}
                    </Chip>
                  ))}
                </div>
              )}
              <HydraCard title={`near-names of ${short(pkg)}`} cypher={sec.cypher} ms={sec.ms} rows={sec.rows.length} />
              <Limits items={sec.limitations} />
            </Reveal>
          ))}
        </section>

        <section id="q6" className="scroll-mt-6">
          <Reveal>
            <SectionTitle n="6" title="Complete blast radius" />
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-3xl text-pretty text-sm text-muted-foreground">
              Everything above, on one page: {h.services_exposed} services across {h.lockfiles_exposed} lockfile snapshots
              {q3 ? `, ${q3.services.length} of them with a lockfile committed while the artifact was installable` : ""}, {inc.q4_maintainers.rows.length}{" "}
              co-maintained packages in the fan-out
              {h.unscanned > 0 ? `, ${h.unscanned} services still unscanned for reachability` : ""}. Total compose time{" "}
              <span className="num">{fmtMs(inc.timing_ms.total)}</span>.
            </p>
          </Reveal>
        </section>

        <Provenance inc={inc} />
      </div>
      <aside className="hidden md:block">
        <Rail />
      </aside>
    </div>
  );
}

function Provenance({ inc }: { inc: Incident }) {
  const p = inc.provenance;
  return (
    <section className={cn("rounded-lg border border-border bg-card/60 p-4 text-xs text-muted-foreground [overflow-wrap:anywhere]", ELEV)}>
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">provenance</div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1 md:grid-cols-[repeat(2,minmax(0,1fr))]">
        <div>generated {fmtUtc(p.generated_at)}</div>
        <div>engine {p.hydradb_image ?? "ghcr.io/hydra-db/hydradb (digest not recorded)"}</div>
        <div>bolt {p.bolt_uri}</div>
        <div>{p.platform}</div>
        <div className="font-mono md:col-span-2">
          graph:{" "}
          {Object.entries(p.graph)
            .map(([k, v]) => `${k} ${v?.toLocaleString() ?? "n/a"}`)
            .join(" · ")}
        </div>
      </div>
      <p className="mt-2 text-[11px]">{p.note}</p>
    </section>
  );
}
