import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { readIncident, listIncidents, short, svcSlug, fmtMs, fmtUtc, type Incident } from "@/lib/incident";
import { LEVEL } from "@/lib/level";
import { HydraCard, Kind, Level, Limits, Notes, Question, ShowAll, Stat, StatStrip } from "@/components/console/ui";
import { cn } from "@/lib/utils";
import { Timeline } from "./timeline";
import { BlastGraph } from "./graph";
import { Rail, type RailEntry } from "./rail";
import { Reveal } from "./reveal";
import { FindVictims } from "./victims";
import { PrintMode } from "./print-mode";
import { ExportButton } from "./export-button";

export const dynamic = "force-static";
export async function generateStaticParams() {
  return (await listIncidents()).map((i) => ({ advisory: i.advisory.key }));
}
export async function generateMetadata({ params }: PageProps<"/incident/[advisory]">) {
  const { advisory } = await params;
  return { title: advisory };
}

const RANK: Record<string, number> = { L2: 3, L1: 2, unscanned: 1, L0: 0 };
const advisoryUrl = (id: string) => (id.startsWith("GHSA-") ? `https://github.com/advisories/${id}` : `https://osv.dev/vulnerability/${id}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const epoch = (t: number) => fmtUtc(new Date(t * 1000).toISOString());
const Q2_CAP = 40;
const Q4_CAP = 15;
// Q5 kinds as the worker emits them, grouped the way the spec reads them.
const KIND_LABEL: Record<string, string> = {
  insertion: "one character apart",
  deletion: "one character apart",
  substitution: "one character apart",
  transposition: "one character apart",
  edit2: "two edits apart",
  scope: "scope confusion",
  hyphen: "hyphen",
  homoglyph: "homoglyph",
  prefix_suffix: "prefix / suffix",
};

// Prototype table: th 10.5px tracked --dim on a --border rule; td 12px --mut on --line rules; row hover --hover.
const TABLE =
  "w-full border-collapse [&_th]:label [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:pb-[9px] [&_th]:text-left " +
  "[&_td]:h-10 [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_td]:whitespace-nowrap [&_td]:text-[12.5px] [&_td]:text-mut " +
  "[&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[180ms] [&_tbody_tr:hover]:bg-hover [&_tbody_tr:last-child_td]:border-b-0";
const CHIP = "inline-flex items-center gap-2 rounded-[7px] border border-border bg-card2 px-2.5 py-[7px] font-mono text-[11.5px] leading-none text-mut";
const CODE = "inline-block rounded-md border border-border bg-code px-2.5 py-2 font-mono text-[11.5px] leading-[1.5] text-signal-2 [overflow-wrap:anywhere]";
const LINK = "rounded-sm text-fg transition-colors duration-[180ms] hover:text-signal-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50";

function SvcLink({ inc, svc, className }: { inc: Incident; svc: string; className?: string }) {
  return (
    <Link href={`/incident/${inc.advisory.key}/${svcSlug(svc)}`} className={cn(LINK, className)}>
      {svcSlug(svc)}
    </Link>
  );
}

const Two = ({ a, b }: { a: string; b: string }) => (
  <>
    {a}
    <br />
    {b}
  </>
);

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
  const level = (svc: string) => inc.q7_reachability[svc]?.level ?? "unscanned";
  const services = [...byService.keys()].sort((a, b) => RANK[level(b)] - RANK[level(a)] || a.localeCompare(b));
  const worst = services.length ? level(services[0]) : null;
  const l2 = services.filter((s) => level(s) === "L2");
  const watched = inc.q1_mspaths.targets ?? inc.provenance.graph.Service;
  const q5Total = q5.reduce((n, [, s]) => n + s.rows.length, 0);
  const q5Kinds = new Set(q5.flatMap(([, s]) => s.rows.map((r) => KIND_LABEL[r.kind] ?? r.kind)));
  const q4Max = Math.max(1, ...q4.rows.map((r) => r.services_at_risk?.length ?? 0));
  const liveBySvc = new Map<string, NonNullable<typeof q3>["rows"][number]>();
  for (const r of q3?.rows ?? []) if (!liveBySvc.has(r.service)) liveBySvc.set(r.service, r);
  const packages = [...new Set(q2.rows.map((r) => short(r.package)))];

  // Plain-language verdict, computed from the headline — never hand-written per incident.
  const verdict = [
    `${h.services_exposed} of ${watched ?? "the"} watched services resolved a compromised version`,
    q3 && h.resolved_while_live != null ? `${h.resolved_while_live} did so while it was still installable` : null,
    h.reachable_L2 > 0 ? `${h.reachable_L2} need${h.reachable_L2 === 1 ? "s" : ""} action now` : "none is reachable from first-party code",
  ]
    .filter(Boolean)
    .join("; ");

  const sections = [q1, inc.q1_mspaths, q2, q3, q4, ...q5.map(([, s]) => s)].filter((s): s is NonNullable<typeof s> => s != null);
  const statements = sections.reduce((n, s) => n + s.cypher.length, 0);
  const rowsTotal = sections.reduce((n, s) => n + s.rows.length, 0);

  const rail: RailEntry[] = [
    { id: "graph", label: "blast radius", n: services.length, dot: "bg-signal" },
    { id: "q1", label: "Q1 verdicts", n: services.length, dot: worst ? LEVEL[worst].dot : "bg-unknown" },
    { id: "q2", label: "Q2 versions", n: q2.rows.length, dot: "bg-l1" },
    { id: "q3", label: "Q3 in window", n: q3 ? q3.in_window : "n/a", dot: "bg-l1" },
    { id: "q4", label: "Q4 maintainers", n: q4.rows.length, dot: "bg-signal-2" },
    { id: "q5", label: "Q5 look-alikes", n: q5Total, dot: "bg-signal-2" },
    { id: "q6", label: "Q6 blast radius", n: services.length, dot: "bg-l0" },
  ];

  return (
    <PrintMode>
    <div className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)_188px] items-start gap-12 px-10 py-[52px] pb-[72px] max-[1180px]:grid-cols-1 max-[900px]:px-5 print:grid-cols-1 print:p-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[11px] leading-none text-dim animate-[en_.3s_var(--ease)_both]">
          <Link href="/incidents" className="-my-2 inline-flex min-h-10 items-center rounded-sm text-mut hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">
            incidents
          </Link>
          <span>/</span>
          <span className="text-mut">{inc.advisory.key}</span>
        </div>

        <header className="mt-5 animate-[en_.3s_var(--ease)_both] [animation-delay:60ms]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 font-mono text-[30px] font-medium leading-[1.15] tracking-[-0.025em] text-fg">{inc.advisory.key}</h1>
            {worst && <Level level={worst} className="rounded-md px-2 py-1.5" />}
            <Kind kind={inc.advisory.kind} className="rounded-md px-2 py-1.5" />
            <Kind kind={inc.advisory.severity} className="rounded-md px-2 py-1.5" />
            <ExportButton />
          </div>
          <div className="mt-3.5 flex flex-wrap gap-x-[22px] gap-y-1.5 font-mono text-[11px] leading-[1.3] text-dim">
            <span>
              published <span className="text-mut">{fmtUtc(inc.advisory.published_at_iso)}</span>
            </span>
            <span>
              source{" "}
              <a href={advisoryUrl(inc.advisory.key)} target="_blank" rel="noreferrer" className="text-mut hover:text-signal-2">
                {inc.advisory.key.startsWith("GHSA-") ? "github advisory database" : "osv.dev"}
              </a>
            </span>
            {packages.length > 0 && (
              <span>
                package <span className="text-mut">{packages[0]}</span>
                {packages.length > 1 && <span> +{packages.length - 1} more</span>}
              </span>
            )}
          </div>
          <p className="m-0 mt-5 max-w-[70ch] text-pretty text-[14px] leading-[1.6] text-fg">
            {inc.advisory.summary.replace(/\.$/, "")}. {verdict}.
          </p>
        </header>

        <StatStrip className="mt-6 animate-[en_.3s_var(--ease)_both] [animation-delay:120ms]">
          <Stat n={h.services_exposed} label="services exposed" rule="bg-signal" delay={0} />
          <Stat n={h.reachable_L2} label="act now" rule="bg-l2" tone="text-l2" delay={90} />
          <Stat n={q3 ? h.resolved_while_live : "n/a"} label="resolved while live" rule="bg-l1" tone="text-l1" delay={180} />
          <Stat n={q4.rows.length} label="maintainer packages" rule="bg-signal-2" delay={270} />
          <Stat n={q5Total} label="look-alike names" rule="bg-signal-2" delay={360} />
          <Stat n={h.unscanned} label="unscanned" rule="bg-unknown" tone="text-unknown" delay={450} />
        </StatStrip>

        <div className="mt-6">
          <BlastGraph inc={inc} />
        </div>

        <Reveal className="mt-6">
          <Question n="1" title="Which of my services are exposed, and at what level?" summary={<Two a={plural(services.length, "service")} b={`${h.reachable_L2} act now`} />}>
            <Distribution
              parts={[
                ["L2", h.reachable_L2],
                ["L1", h.imported_L1],
                ["L0", h.present_only_L0],
                ["unscanned", h.unscanned],
              ]}
            />
            <div className="mt-5 overflow-x-auto">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th>service</th>
                    <th>verdict</th>
                    <th>lockfiles</th>
                    <th>pulled in via</th>
                    <th>latest commit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc) => {
                    const rows = byService.get(svc)!;
                    const latest = rows[0];
                    return (
                      <tr key={svc}>
                        <td className="font-mono !text-[12px] !text-fg">
                          <SvcLink inc={inc} svc={svc} />
                        </td>
                        <td>
                          <Level level={level(svc)} />
                        </td>
                        <td className="num">{rows.length}</td>
                        <td className="font-mono !text-[11.5px]">{latest.via ? `${short(latest.via)} · ${latest.hops} hop${latest.hops === 1 ? "" : "s"}` : "direct dependency"}</td>
                        <td className="font-mono !text-[11.5px]">
                          {latest.sha.slice(0, 7)} · {epoch(latest.committed_at)}
                        </td>
                        <td className="text-right">
                          <Link href={`/incident/${inc.advisory.key}/${svcSlug(svc)}`} className="inline-flex min-h-10 items-center px-0.5 text-[11px] font-medium leading-none text-signal-2 hover:text-signal">
                            open →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {services.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center font-mono !text-[11.5px] !text-dim">
                        no watched service resolved an affected version
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <HydraCard flat title="which services resolve an affected version, and at what level?" cypher={q1.cypher} ms={q1.ms} rows={q1.rows.length} timing={q1.timing} />
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
            </div>
            {inc.q1_mspaths.truncated && <Limits items={["Path list truncated by resultLimit — membership above is still exact."]} />}
            <Notes
              items={[
                "verdict is per service, highest across its lockfiles. unscanned means the service resolves an affected version but its source was not read — not that it is clean.",
                ...q1.limitations,
              ]}
            />
          </Question>
        </Reveal>

        <Reveal className="mt-6">
          <Question
            n="2"
            title="Which versions were installable, and for how long?"
            summary={<Two a={plural(q2.rows.length, "version")} b={`${q2.rows.filter((r) => r.removed).length} removed`} />}
          >
            <div className="overflow-x-auto">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th>version</th>
                    <th>published (exact)</th>
                    <th>live until</th>
                    <th>state</th>
                  </tr>
                </thead>
                <tbody>
                  {q2.rows.length > Q2_CAP ? (
                    <ShowAll n={q2.rows.length} cols={4} more={q2.rows.slice(Q2_CAP).map((r) => versionRow(r, q2.first?.version))}>
                      {q2.rows.slice(0, Q2_CAP).map((r) => versionRow(r, q2.first?.version))}
                    </ShowAll>
                  ) : (
                    q2.rows.map((r) => versionRow(r, q2.first?.version))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <HydraCard flat title="which versions were affected, and when was each published?" cypher={q2.cypher} ms={q2.ms} rows={q2.rows.length} />
            </div>
            <Notes items={q2.limitations} />
          </Question>
        </Reveal>

        <Reveal className="mt-6">
          <Question
            n="3"
            title="Who pulled it in while it was still installable?"
            summary={q3 ? <Two a={`${q3.in_window} in window`} b={`${q3.pinned_removed} pin removed`} /> : <Two a="n/a" b="not time-bounded" />}
          >
            {q3 === null ? (
              <p className="m-0 max-w-[64ch] text-pretty text-[12.5px] text-mut">
                Not applicable: this is a CVE — the artifact is still on the registry, so exposure is not time-bounded and “resolved while live” collapses into “resolved at
                all” (Q1).
              </p>
            ) : (
              <>
                <div className="-mx-2 -mt-1.5">
                  <Timeline rows={q3.rows} versions={q2.rows} advisoryPublished={inc.advisory.published_at} />
                </div>
                <div className="overflow-x-auto">
                  <table className={TABLE}>
                    <thead>
                      <tr>
                        <th>service</th>
                        <th>lockfile</th>
                        <th>resolved at</th>
                        <th>commit</th>
                        <th>in window</th>
                        <th>window</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q3.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="font-mono !text-[12px] !text-fg">
                            <SvcLink inc={inc} svc={r.service} />
                          </td>
                          <td className="font-mono !text-[11.5px]">{short(r.version)}</td>
                          <td className="font-mono !text-[11.5px]">{fmtUtc(r.resolved_at_iso)}</td>
                          <td className="font-mono !text-[11.5px]">{r.sha.slice(0, 7)}</td>
                          <td className="font-mono !text-[11.5px]">
                            {r.evidence.includes("in_window") ? <span className="text-l1">yes</span> : <span className="text-dim">no</span>}
                            {r.evidence.includes("pinned_removed") && <span className="text-l2"> · pins removed</span>}
                          </td>
                          <td className="font-mono !text-[11px]">
                            {fmtUtc(r.live_from_iso)} → {fmtUtc(r.live_to_iso)} <Kind kind={r.live_to_kind} className="ml-1" />
                          </td>
                        </tr>
                      ))}
                      {q3.rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center font-mono !text-[11.5px] !text-dim">
                            no watched lockfile was committed inside the window or pins a removed version
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4">
                  <HydraCard flat title="which lockfiles resolved the version inside its installable window?" cypher={q3.cypher} ms={q3.ms} rows={q3.rows.length} />
                </div>
                <Notes items={[q3.note ?? "", ...q3.limitations]} />
              </>
            )}
          </Question>
        </Reveal>

        <Reveal className="mt-6">
          <Question
            n="4"
            title="What else could the same maintainers reach?"
            summary={<Two a={plural(q4.maintainers.length, "maintainer")} b={plural(q4.rows.length, "package")} />}
          >
            <div className="flex flex-wrap gap-2">
              {q4.maintainers.map((m) => (
                <span key={m.login} className={CHIP}>
                  <span className="size-[5px] rounded-full bg-signal" aria-hidden />
                  {short(m.login)}
                  <span className="text-dim">{plural(q4.rows.filter((r) => r.maintainers.includes(m.login)).length, "package")}</span>
                  <span className={m.twofa === false ? "text-l1" : "text-dim"}>2FA {m.twofa === null ? "unknown" : m.twofa ? "on" : "off"}</span>
                </span>
              ))}
              {q4.maintainers.length === 0 && <span className="font-mono text-[11.5px] text-dim">no maintainer recorded</span>}
            </div>
            <div className="mt-[18px] overflow-x-auto">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th>package</th>
                    <th>weekly downloads</th>
                    <th className="w-[38%]">services that would be reached</th>
                  </tr>
                </thead>
                <tbody>
                  {q4.rows.length > Q4_CAP ? (
                    <ShowAll n={q4.rows.length} cols={3} more={q4.rows.slice(Q4_CAP).map((r) => reachRow(r, q4Max))}>
                      {q4.rows.slice(0, Q4_CAP).map((r) => reachRow(r, q4Max))}
                    </ShowAll>
                  ) : (
                    q4.rows.map((r) => reachRow(r, q4Max))
                  )}
                  {q4.rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center font-mono !text-[11.5px] !text-dim">
                        no co-maintained packages in the ingested graph
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <HydraCard flat title="which other packages do these maintainers publish, and who resolves them?" cypher={q4.cypher} ms={q4.ms} rows={q4.rows.length} />
            </div>
            <Limits items={["past the computed cap the reach cell reads “— not computed” — never a 0.", ...q4.limitations]} />
          </Question>
        </Reveal>

        <Reveal className="mt-6">
          <Question n="5" title="Which look-alike names exist?" summary={<Two a={plural(q5Total, "name")} b={plural(q5Kinds.size, "kind")} />}>
            <div className="flex flex-col gap-4">
              {q5
                .filter(([, sec]) => sec.rows.length > 0)
                .map(([pkg, sec]) => {
                  const groups = new Map<string, typeof sec.rows>();
                  for (const r of sec.rows) {
                    const k = KIND_LABEL[r.kind] ?? r.kind;
                    groups.set(k, [...(groups.get(k) ?? []), r]);
                  }
                  return (
                    <div key={pkg} className="flex flex-col gap-4">
                      {q5.length > 1 && <div className="font-mono text-[11px] leading-none text-dim">near {short(pkg)}</div>}
                      {[...groups].map(([kind, rs]) => (
                        <div key={kind}>
                          <div className="label mb-2.5">{kind}</div>
                          <div className="flex flex-wrap gap-[7px]">
                            {rs.map((r) => (
                              <span key={r.package} className={cn(CHIP, "rounded-md px-[9px] py-1.5")}>
                                {short(r.package)}
                                <span className="text-[10.5px] text-dim">
                                  d{r.distance}
                                  {r.kind === "homoglyph" && " · homoglyph"}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              {q5Total === 0 && (
                <div className="flex flex-wrap items-center gap-5">
                  {/* the report carries no art except this hole: Q5 with nothing to show */}
                  <Image src="/art/typosquat-pair.png" alt="" width={256} height={140} className="pixel opacity-90" unoptimized />
                  <p className="m-0 font-mono text-[11.5px] text-dim">
                    no near-names in the ingested corpus{q5.length > 1 ? ` across ${plural(q5.length, "package")}` : q5[0] ? ` for ${short(q5[0][0])}` : ""}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {q5.map(([pkg, sec]) => (
                <HydraCard flat key={pkg} title={`near-names of ${short(pkg)}`} cypher={sec.cypher} ms={sec.ms} rows={sec.rows.length} />
              ))}
            </div>
            <Notes items={[...new Set(q5.flatMap(([, s]) => s.limitations))]} />
          </Question>
        </Reveal>

        <Reveal className="mt-6">
          <Question
            n="6"
            title="What is the blast radius, service by service?"
            summary={<Two a={plural(services.length, "service")} b={`${h.unscanned} unscanned`} />}
            footer={
              <div className="flex flex-wrap items-center justify-between gap-6 px-[18px] py-4">
                <div className="min-w-0">
                  <div className="label mb-[9px]">regenerate</div>
                  <code className={CODE}>make incident ID={inc.advisory.key} ARGS=&quot;--out&quot;</code>
                </div>
                {services[0] && (
                  <div className="min-w-0">
                    <div className="label mb-[9px]">badge · {svcSlug(services[0])}</div>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/badge/${svcSlug(services[0])}.svg`} alt={`reachable badge for ${svcSlug(services[0])}`} height={20} className="h-5 w-auto" />
                      <code className="font-mono text-[11px] text-dim [overflow-wrap:anywhere]">{`![reachable](/badge/${svcSlug(services[0])}.svg)`}</code>
                    </div>
                  </div>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-px overflow-hidden rounded-lg border border-border bg-border max-[760px]:grid-cols-1">
              <Column dot="bg-l2" title="act now" n={l2.length}>
                {l2.map((s) => (
                  <SvcLink key={s} inc={inc} svc={s} className="font-mono text-[12px] leading-[1.3] !text-mut hover:!text-signal-2" />
                ))}
                {l2.length === 0 && <span className="font-mono text-[12px] text-dim">none</span>}
              </Column>
              <Column dot="bg-l1" title="resolved while live" n={q3 ? liveBySvc.size : "n/a"}>
                {[...liveBySvc.values()].map((r) => (
                  <span key={r.service} className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px] leading-[1.3]">
                    <SvcLink inc={inc} svc={r.service} className="!text-mut hover:!text-signal-2" />
                    <span className="text-[11px] text-dim">
                      {r.sha.slice(0, 7)} · {fmtUtc(r.resolved_at_iso)}
                    </span>
                  </span>
                ))}
                {liveBySvc.size === 0 && <span className="font-mono text-[12px] text-dim">{q3 ? "none" : "not time-bounded (CVE)"}</span>}
              </Column>
              <Column dot="bg-l0" title="present only" n={services.filter((s) => level(s) === "L0" || level(s) === "L1").length}>
                {services
                  .filter((s) => level(s) === "L0" || level(s) === "L1")
                  .map((s) => (
                    <span key={s} className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px] leading-[1.3]">
                      <SvcLink inc={inc} svc={s} className="!text-mut hover:!text-signal-2" />
                      {level(s) === "L1" && <span className={cn("text-[11px]", LEVEL.L1.text)}>— {LEVEL.L1.label}</span>}
                    </span>
                  ))}
                {services.filter((s) => level(s) === "L0" || level(s) === "L1").length === 0 && <span className="font-mono text-[12px] text-dim">none</span>}
              </Column>
              {/* unscanned gets its own column and its own grey dot: exposed, source not read — never under the green header */}
              <Column dot="bg-unknown" title="unscanned" n={services.filter((s) => level(s) === "unscanned").length}>
                {services
                  .filter((s) => level(s) === "unscanned")
                  .map((s) => (
                    <SvcLink key={s} inc={inc} svc={s} className="font-mono text-[12px] leading-[1.3] !text-mut hover:!text-signal-2" />
                  ))}
                {services.filter((s) => level(s) === "unscanned").length === 0 && <span className="font-mono text-[12px] text-dim">none</span>}
              </Column>
            </div>
            <Notes
              items={[
                `${plural(h.services_exposed, "service")} · ${plural(h.lockfiles_exposed, "lockfile snapshot")} · ${plural(q4.rows.length, "co-maintained package")}${h.unscanned > 0 ? ` · ${h.unscanned} unscanned` : ""} · composed in ${fmtMs(inc.timing_ms.total)}`,
              ]}
            />
          </Question>
        </Reveal>

        <div className="mt-6 print:hidden">
          <FindVictims advisory={inc.advisory.key} />
        </div>

        <Provenance inc={inc} statements={statements} rows={rowsTotal} />
      </div>

      <aside className="max-[1180px]:hidden print:hidden">
        <Rail entries={rail} />
      </aside>
    </div>
    </PrintMode>
  );
}

function Column({ dot, title, n, children }: { dot: string; title: string; n: number | string; children: React.ReactNode }) {
  return (
    <div className="bg-card px-4 pb-4 pt-3.5">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
        <span className="label !text-mut">{title}</span>
        <span className="num text-[11px] leading-none text-dim">{n}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function versionRow(r: Incident["q2_versions"]["rows"][number], first: string | undefined) {
  return (
    <tr key={r.version}>
      <td className="font-mono !text-[12px] !text-fg">
        {short(r.version)}
        {first === r.version && <Kind kind="first" className="ml-2" />}
      </td>
      <td className="font-mono !text-[11.5px]">{fmtUtc(r.published_at_iso)}</td>
      <td className="font-mono !text-[11.5px]">
        {r.live_to_kind === "unbounded" ? "still installable" : fmtUtc(r.live_to_iso)}
        {r.live_to_kind !== "exact" && <Kind kind={r.live_to_kind} className="ml-1.5" />}
      </td>
      <td className="font-mono !text-[11.5px]">
        {r.removed ? <span className="text-l2">removed</span> : r.removed === false ? "present" : <span className="text-dim">not recorded</span>}
      </td>
    </tr>
  );
}

// Q4 reach cell: mono count + 84×5 bar + service names. Past the cap (services_at_risk === null)
// the cell reads exactly `— not computed` with a zero-width --unknown bar — never a 0.
function reachRow(r: Incident["q4_maintainers"]["rows"][number], max: number) {
  const n = r.services_at_risk;
  return (
    <tr key={r.package}>
      <td className="font-mono !text-[12px] !text-fg">{short(r.package)}</td>
      <td className="num !text-[11.5px]">{r.downloads == null ? <span className="font-mono text-dim">not recorded</span> : r.downloads.toLocaleString()}</td>
      <td>
        <div className="flex items-center gap-2.5">
          <span className={cn("num min-w-[22px] text-[12px] font-medium leading-none", n === null || n.length === 0 ? "text-dim" : "text-fg")}>{n === null ? "" : n.length}</span>
          <span className="h-[5px] w-[84px] shrink-0 overflow-hidden rounded-[3px] bg-hover" aria-hidden>
            <span
              className={cn("block h-full origin-left animate-[grow_.5s_var(--ease)_both]", n === null ? "w-0 bg-unknown" : "bg-signal/80")}
              style={n === null ? undefined : { width: `${(n.length / max) * 100}%` }}
            />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-[1.3] text-dim" title={n === null ? undefined : n.map(svcSlug).join(", ")}>
            {n === null ? "— not computed" : n.length === 0 ? "none" : n.map((s) => svcSlug(s).split("/").pop()).join(", ")}
          </span>
        </div>
      </td>
    </tr>
  );
}

// Q1 verdict distribution: 8px bar on a --hover track, one segment per level growing from the
// left, then a dot/label/count legend. Same numbers as the strip, at Q1's grain — deliberate.
function Distribution({ parts }: { parts: [keyof typeof LEVEL, number][] }) {
  const total = parts.reduce((n, [, c]) => n + c, 0);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-xs bg-hover" aria-hidden>
        {parts
          .filter(([, c]) => c > 0)
          .map(([k, c]) => (
            <span key={k} className={cn("origin-left animate-[grow_.5s_var(--ease)_both] [animation-delay:180ms]", LEVEL[k].dot)} style={{ width: `${(c / Math.max(total, 1)) * 100}%` }} />
          ))}
      </div>
      <div className="mt-[11px] flex flex-wrap gap-5 font-mono text-[11px] leading-none text-dim">
        {parts.map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-[7px]">
            <span className={cn("size-1.5 rounded-full", LEVEL[k].dot)} aria-hidden />
            {LEVEL[k].label} <span className="text-mut">{c}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Provenance({ inc, statements, rows }: { inc: Incident; statements: number; rows: number }) {
  const p = inc.provenance;
  const digest = p.hydradb_image?.match(/sha256:([0-9a-f]+)/)?.[1];
  return (
    <footer className="mt-6 border-t border-line pt-[18px] font-mono text-[10.5px] leading-[1.6] text-dim [overflow-wrap:anywhere]">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>report generated {fmtUtc(p.generated_at)}</span>
        <span>
          graph snapshot{" "}
          {Object.entries(p.graph)
            .map(([k, v]) => `${k.toLowerCase()} ${v?.toLocaleString() ?? "n/a"}`)
            .join(" · ")}
        </span>
        <span className="num">
          {statements} statements · {rows} rows · {fmtMs(inc.timing_ms.total)} total
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
        <span title={p.hydradb_image ?? undefined}>engine {digest ? `sha256:${digest.slice(0, 12)}` : "digest not recorded"}</span>
        <span>{p.bolt_uri}</span>
        <span>
          {p.host} · {p.platform}
        </span>
      </div>
      <p className="m-0 mt-1 max-w-[80ch] text-pretty">{p.note}</p>
    </footer>
  );
}
