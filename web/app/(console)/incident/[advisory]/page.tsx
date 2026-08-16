import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { readIncident, listIncidents, short, svcSlug, fmtMs, fmtUtc, type Incident } from "@/lib/incident";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HydraCard, Kind, Level, Limits, Notes, Question, ShowAll, Stat, Chip } from "@/components/console/ui";
import { cn } from "@/lib/utils";
import { Timeline } from "./timeline";
import { BlastGraph } from "./graph";
import { Rail } from "./rail";
import { Reveal } from "./reveal";
import { FindVictims } from "./victims";

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
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const DOT: Record<string, string> = { L2: "bg-l2", L1: "bg-l1", L0: "bg-l0", unscanned: "bg-unknown" };
const LINK = "rounded-sm transition-colors hover:text-signal-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50";
const Q2_CAP = 40;

function SvcLink({ inc, svc, className }: { inc: Incident; svc: string; className?: string }) {
  return (
    <Link href={`/incident/${inc.advisory.key}/${svcSlug(svc)}`} className={cn(LINK, className)}>
      {svcSlug(svc)}
    </Link>
  );
}

export default async function IncidentPage({ params }: PageProps<"/incident/[advisory]">) {
  const { advisory } = await params;
  const inc = await readIncident(advisory);
  if (!inc) notFound();
  const h = inc.headline;
  const q1 = inc.q1_exposed;
  const q2 = inc.q2_versions;
  const q3 = inc.q3_while_live;
  const q4 = inc.q4_maintainers;
  const q5 = Object.entries(inc.q5_typosquats);
  const byService = new Map<string, typeof q1.rows>();
  for (const r of q1.rows) byService.set(r.service, [...(byService.get(r.service) ?? []), r]);
  const services = [...byService.keys()].sort((a, b) => rank(inc, b) - rank(inc, a) || a.localeCompare(b));
  const level = (svc: string) => inc.q7_reachability[svc]?.level ?? "unscanned";
  const l2 = services.filter((s) => level(s) === "L2");
  const watched = inc.q1_mspaths.targets ?? inc.provenance.graph.Service;
  const q5Total = q5.reduce((n, [, s]) => n + s.rows.length, 0);
  const q4Max = Math.max(1, ...q4.rows.map((r) => r.services_at_risk?.length ?? 0));
  const liveBySvc = new Map<string, NonNullable<typeof q3>["rows"][number]>();
  for (const r of q3?.rows ?? []) if (!liveBySvc.has(r.service)) liveBySvc.set(r.service, r);

  // Plain-language verdict, computed from the headline — never hand-written per incident.
  const verdict = [
    `${h.services_exposed} of ${watched ?? "the"} watched services resolved a compromised version`,
    q3 && h.resolved_while_live != null ? `${h.resolved_while_live} did so while it was still installable` : null,
    h.reachable_L2 > 0 ? `${h.reachable_L2} need${h.reachable_L2 === 1 ? "s" : ""} action now` : "none is reachable from first-party code",
  ]
    .filter(Boolean)
    .join("; ");

  const summaries = {
    q1: `${plural(services.length, "service")} · ${plural(q1.lockfiles, "lockfile")} · ${h.reachable_L2} act now`,
    q2: `${plural(q2.rows.length, "affected version")}${q2.first ? ` · first ${short(q2.first.version).replace(/^.*@/, "")}` : ""} · ${q2.rows.filter((r) => r.removed).length} removed`,
    q3: q3 ? `${plural(q3.services.length, "service")} · ${q3.in_window} in window · ${q3.pinned_removed} pin removed` : "n/a for CVE",
    q4: `${plural(q4.maintainers.length, "maintainer")} · ${plural(q4.rows.length, "co-maintained package")} · up to ${q4Max} services at risk`,
    q5: `${plural(q5Total, "near-name")} across ${plural(q5.length, "package")}`,
    q6: `${h.services_exposed} exposed · ${q3 ? liveBySvc.size : "—"} while live · ${h.reachable_L2} act now`,
  };
  const railCounts = { q1: services.length, q2: q2.rows.length, q3: q3 ? q3.services.length : "—", q4: q4.rows.length, q5: q5Total, q6: h.reachable_L2 };

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_120px] md:gap-8">
      <div className="min-w-0 space-y-8">
        <header className="space-y-4">
          <Link
            href="/incidents"
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
          <p className="max-w-3xl text-pretty text-[15px] leading-snug">{verdict}.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat n={h.services_exposed} label="services exposed" rule="bg-signal" />
            <Stat n={h.resolved_while_live} label="resolved while live" tone="text-l1" rule="bg-l1" />
            <Stat n={h.reachable_L2} label="reachable · L2 · act now" tone="text-l2" rule="bg-l2" />
            <Stat n={h.imported_L1} label="imported · L1" tone="text-l1/80" rule="bg-l1/70" />
            <Stat n={h.present_only_L0} label="present only · L0" tone="text-l0" rule="bg-l0" />
            <Stat n={h.unscanned} label="unscanned" tone="text-unknown" rule="bg-unknown" />
          </div>
        </header>

        <BlastGraph inc={inc} />

        <Reveal>
          <Question
            n="1"
            title="Which services are transitively exposed?"
            summary={summaries.q1}
            footer={
              <>
                <HydraCard flat title="who is exposed" cypher={q1.cypher} ms={q1.ms} rows={q1.rows.length} timing={q1.timing} />
                {inc.q1_mspaths.cypher.length > 0 && (
                  <HydraCard
                    flat
                    title={`blast radius in one call — ${inc.q1_mspaths.sources ?? "?"} versions × ${inc.q1_mspaths.targets ?? "?"} services`}
                    cypher={inc.q1_mspaths.cypher}
                    ms={inc.q1_mspaths.ms}
                    rows={inc.q1_mspaths.rows.length}
                    truncated={inc.q1_mspaths.truncated}
                    timing={inc.q1_mspaths.timing}
                  />
                )}
                {inc.q1_mspaths.truncated && <Limits items={["Path list truncated by resultLimit — membership above is still exact."]} />}
                <Notes items={q1.limitations} />
              </>
            }
          >
            <Distribution
              parts={[
                ["L2", h.reachable_L2, "bg-l2"],
                ["L1", h.imported_L1, "bg-l1"],
                ["L0", h.present_only_L0, "bg-l0"],
                ["unscanned", h.unscanned, "bg-unknown"],
              ]}
            />
            <div className="overflow-hidden rounded-lg border border-border">
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
                          <SvcLink inc={inc} svc={svc} />
                        </TableCell>
                        <TableCell>
                          <Level level={level(svc)} />
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
            </div>
          </Question>
        </Reveal>

        <Reveal>
          <Question
            n="2"
            title="Which version introduced it?"
            summary={summaries.q2}
            footer={
              <>
                <HydraCard flat title="which version" cypher={q2.cypher} ms={q2.ms} rows={q2.rows.length} />
                <Notes items={q2.limitations} />
              </>
            }
          >
            <div className="overflow-hidden rounded-lg border border-border">
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
                  {q2.rows.length > Q2_CAP ? (
                    <ShowAll n={q2.rows.length} cols={4} more={q2.rows.slice(Q2_CAP).map((r) => versionRow(r, q2.first?.version))}>
                      {q2.rows.slice(0, Q2_CAP).map((r) => versionRow(r, q2.first?.version))}
                    </ShowAll>
                  ) : (
                    q2.rows.map((r) => versionRow(r, q2.first?.version))
                  )}
                </TableBody>
              </Table>
            </div>
          </Question>
        </Reveal>

        <Reveal>
          <Question
            n="3"
            title="Which apps resolved the bad version while it was live?"
            summary={summaries.q3}
            star
            footer={
              q3 && (
                <>
                  <HydraCard flat title="resolved while live" cypher={q3.cypher} ms={q3.ms} rows={q3.rows.length} />
                  <Notes items={[q3.note ?? "", ...q3.limitations]} />
                </>
              )
            }
          >
            {q3 === null ? (
              <p className="text-pretty text-sm text-muted-foreground">
                Not applicable: this is a CVE — the artifact is still on the registry, so exposure is not time-bounded and “resolved while live” collapses into
                “resolved at all” (question 1).
              </p>
            ) : (
              <>
                <Timeline rows={q3.rows} versions={q2.rows} advisoryPublished={inc.advisory.published_at} />
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
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
                            <SvcLink inc={inc} svc={r.service} />
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
                </div>
              </>
            )}
          </Question>
        </Reveal>

        <Reveal>
          <Question
            n="4"
            title="Which packages share maintainers or infrastructure?"
            summary={summaries.q4}
            star
            footer={
              <>
                <HydraCard flat title="maintainer fan-out" cypher={q4.cypher} ms={q4.ms} rows={q4.rows.length} />
                <Notes items={q4.limitations} />
              </>
            }
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {q4.maintainers.map((m) => (
                <Chip key={m.login} tone={m.twofa === false ? "border-l1/40 text-l1" : ""}>
                  {short(m.login)} · 2FA {m.twofa === null ? "unknown" : m.twofa ? "on" : "off"}
                </Chip>
              ))}
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>co-maintained package</TableHead>
                    <TableHead className="text-right">weekly downloads</TableHead>
                    <TableHead>services resolving it today</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q4.rows.slice(0, 15).map((r) => (
                    <TableRow key={r.package}>
                      <TableCell className="font-mono">{short(r.package)}</TableCell>
                      <TableCell className="num text-right text-xs text-muted-foreground">{r.downloads?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.services_at_risk === null ? (
                          <span className="text-muted-foreground/70">— not computed</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="num w-5 text-right">{r.services_at_risk.length}</span>
                            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-border" aria-hidden>
                              <span className="block h-full rounded-full bg-signal/80" style={{ width: `${(r.services_at_risk.length / q4Max) * 100}%` }} />
                            </span>
                            <span className="min-w-0 truncate text-muted-foreground">{r.services_at_risk.map(svcSlug).join(", ")}</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {q4.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        No co-maintained packages in the ingested graph.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Question>
        </Reveal>

        <Reveal>
          <Question
            n="5"
            title="Are there likely typosquats nearby?"
            summary={summaries.q5}
            star
            footer={
              <>
                {q5.map(([pkg, sec]) => (
                  <HydraCard flat key={pkg} title={`near-names of ${short(pkg)}`} cypher={sec.cypher} ms={sec.ms} rows={sec.rows.length} />
                ))}
                <Notes items={[...new Set(q5.flatMap(([, s]) => s.limitations))]} />
              </>
            }
          >
            <div className="space-y-4">
              {q5.map(([pkg, sec]) => {
                const kinds = [...new Set(sec.rows.map((r) => r.kind))];
                return (
                  <div key={pkg}>
                    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 font-mono text-xs text-muted-foreground">
                      <span>near {short(pkg)}</span>
                      {kinds.length > 0 && <span className="text-[10px] text-muted-foreground/70">{kinds.join(" · ")}</span>}
                    </div>
                    {sec.rows.length === 0 ? (
                      <div className="text-xs text-muted-foreground">no near-names in the ingested corpus</div>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {kinds.map((k) => (
                          <div key={k} className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{k}</span>
                            {sec.rows
                              .filter((r) => r.kind === k)
                              .slice(0, 12)
                              .map((r) => (
                                <Chip key={r.package} tone={r.distance <= 1 ? "border-signal/40 text-signal-2" : ""}>
                                  {short(r.package)} · d{r.distance}
                                </Chip>
                              ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Question>
        </Reveal>

        <Reveal>
          <Question
            n="6"
            title="Complete blast radius"
            summary={summaries.q6}
            footer={
              <div className="grid gap-x-6 gap-y-2 border-t border-border px-4 py-3 font-mono text-[11px] text-muted-foreground md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider">regenerate this report</div>
                  <code className="text-foreground/90">make incident ID={inc.advisory.key} ARGS=&quot;--out&quot;</code>
                </div>
                {services[0] && (
                  <div className="min-w-0">
                    <div className="mb-1 text-[10px] uppercase tracking-wider">badge · {svcSlug(services[0])}</div>
                    <code className="block truncate text-foreground/90">{`![reachable](/badge/${svcSlug(services[0])}.svg)`}</code>
                  </div>
                )}
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">exposed · {services.length}</div>
                <ul className="space-y-1 font-mono text-xs">
                  {services.map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[level(s)])} aria-hidden />
                      <SvcLink inc={inc} svc={s} />
                    </li>
                  ))}
                  {services.length === 0 && <li className="text-muted-foreground">none</li>}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">while live · {q3 ? liveBySvc.size : "n/a"}</div>
                <ul className="space-y-1 font-mono text-xs">
                  {[...liveBySvc.values()].map((r) => (
                    <li key={r.service} className="flex flex-wrap items-baseline gap-x-2">
                      <SvcLink inc={inc} svc={r.service} />
                      <span className="text-[11px] text-muted-foreground">
                        {r.sha.slice(0, 12)} · {fmtUtc(r.resolved_at_iso)}
                      </span>
                    </li>
                  ))}
                  {liveBySvc.size === 0 && <li className="text-muted-foreground">{q3 ? "none" : "not time-bounded (CVE)"}</li>}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-l2">act now · {l2.length}</div>
                <ul className="space-y-1 font-mono text-xs">
                  {l2.map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-l2" aria-hidden />
                      <SvcLink inc={inc} svc={s} />
                    </li>
                  ))}
                  {l2.length === 0 && <li className="text-muted-foreground">none</li>}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              {h.services_exposed} services · {h.lockfiles_exposed} lockfile snapshots · {q4.rows.length} co-maintained packages
              {h.unscanned > 0 ? ` · ${h.unscanned} unscanned` : ""} · composed in <span className="num">{fmtMs(inc.timing_ms.total)}</span>
            </p>
          </Question>
        </Reveal>

        <Reveal>
          <FindVictims advisory={inc.advisory.key} />
        </Reveal>

        <Provenance inc={inc} />
      </div>
      <aside className="hidden md:block">
        <Rail counts={railCounts} />
      </aside>
    </div>
  );
}

function versionRow(r: Incident["q2_versions"]["rows"][number], first: string | undefined) {
  return (
    <TableRow key={r.version}>
      <TableCell className="font-mono">
        {short(r.version)}
        {first === r.version && <Chip tone="ml-2 border-signal/40 text-signal-2">first</Chip>}
      </TableCell>
      <TableCell className="font-mono text-xs">{fmtUtc(r.published_at_iso)}</TableCell>
      <TableCell className="font-mono text-xs">
        {r.live_to_kind === "unbounded" ? "still live" : fmtUtc(r.live_to_iso)} <Kind kind={r.live_to_kind} />
      </TableCell>
      <TableCell className="text-xs">{r.removed ? <span className="text-l2">removed</span> : <span className="text-muted-foreground">present</span>}</TableCell>
    </TableRow>
  );
}

// Verdict distribution: one segment per level, width ∝ count. Zero-count levels are listed, not drawn.
function Distribution({ parts }: { parts: [string, number, string][] }) {
  const total = parts.reduce((n, [, c]) => n + c, 0);
  if (total === 0) return null;
  return (
    <div className="mb-3">
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-border" aria-hidden>
        {parts
          .filter(([, c]) => c > 0)
          .map(([k, c, bg]) => (
            <span key={k} className={cn("h-full", bg)} style={{ width: `${(c / total) * 100}%` }} />
          ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
        {parts.map(([k, c, bg]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", c > 0 ? bg : "bg-border")} aria-hidden />
            <span className="num">{c}</span> {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function Provenance({ inc }: { inc: Incident }) {
  const p = inc.provenance;
  const digest = p.hydradb_image?.match(/sha256:([0-9a-f]+)/)?.[1];
  return (
    <footer className="border-t border-border pt-3 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>generated {fmtUtc(p.generated_at)}</span>
        <span title={p.hydradb_image ?? undefined}>engine {digest ? `sha256:${digest.slice(0, 12)}` : "digest not recorded"}</span>
        <span>{p.bolt_uri}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(p.graph).map(([k, v]) => (
          <span key={k}>
            {k} <span className="num text-foreground/80">{v?.toLocaleString() ?? "n/a"}</span>
          </span>
        ))}
      </div>
      <details className="mt-2">
        <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">
          details
        </summary>
        <p className="max-w-3xl text-pretty font-sans">
          {p.note} Host {p.host} · {p.platform}.
        </p>
      </details>
    </footer>
  );
}
