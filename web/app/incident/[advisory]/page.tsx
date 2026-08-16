import Link from "next/link";
import { notFound } from "next/navigation";
import { readIncident, listIncidents, short, svcSlug, fmtMs, fmtUtc } from "@/lib/incident";
import { HydraCard, Kind, Level, Limits, Stat } from "@/app/ui";
import { Timeline } from "./timeline";

export const dynamic = "force-static";
export async function generateStaticParams() {
  return (await listIncidents()).map((i) => ({ advisory: i.advisory.key }));
}

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
    <div className="space-y-10">
      <header>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl text-orange-300">{inc.advisory.key}</h1>
          <span className="rounded border border-zinc-700 px-1.5 font-mono text-[10px] uppercase text-zinc-400">
            {inc.advisory.kind} · {inc.advisory.severity}
          </span>
          <span className="text-xs text-zinc-500">published {fmtUtc(inc.advisory.published_at_iso)}</span>
        </div>
        <p className="mt-1 text-zinc-300">{inc.advisory.summary}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat n={h.services_exposed} label="services exposed" />
          <Stat n={h.resolved_while_live} label="resolved while live" tone="text-amber-300" />
          <Stat n={h.reachable_L2} label="reachable · L2 · act now" tone="text-red-300" />
          <Stat n={h.imported_L1} label="imported · L1" tone="text-amber-200" />
          <Stat n={h.present_only_L0} label="present only · L0" tone="text-emerald-300" />
          <Stat n={h.unscanned} label="unscanned" tone="text-zinc-400" />
        </div>
      </header>

      {/* Q1 */}
      <section>
        <SectionTitle n="1" title="Which services are transitively exposed?" />
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2">service</th>
                <th className="px-3 py-2">verdict</th>
                <th className="px-3 py-2">lockfiles</th>
                <th className="px-3 py-2">pulled in via</th>
                <th className="px-3 py-2">latest exposed commit</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => {
                const rows = byService.get(svc)!;
                const latest = rows[0];
                return (
                  <tr key={svc} className="border-t border-zinc-800/80 hover:bg-zinc-900/40">
                    <td className="px-3 py-2 font-mono">
                      <Link href={`/incident/${inc.advisory.key}/${svcSlug(svc)}`} className="text-zinc-100 hover:text-orange-300">
                        {svcSlug(svc)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Level level={inc.q7_reachability[svc]?.level ?? "unscanned"} />
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-zinc-300">{rows.length}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-300">
                      {latest.via ? (
                        <>
                          {short(latest.via)} <span className="text-zinc-500">· {latest.hops} hop{latest.hops === 1 ? "" : "s"}</span>
                        </>
                      ) : (
                        <span className="text-zinc-500">direct dependency</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                      {latest.sha.slice(0, 12)} · {fmtUtc(new Date(latest.committed_at * 1000).toISOString())}
                    </td>
                  </tr>
                );
              })}
              {services.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    No seed service resolved an affected version.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

      {/* Q2 */}
      <section>
        <SectionTitle n="2" title="Which version introduced it?" />
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2">version</th>
                <th className="px-3 py-2">published (exact)</th>
                <th className="px-3 py-2">live until</th>
                <th className="px-3 py-2">status</th>
              </tr>
            </thead>
            <tbody>
              {inc.q2_versions.rows.map((r) => (
                <tr key={r.version} className="border-t border-zinc-800/80">
                  <td className="px-3 py-2 font-mono">
                    {short(r.version)}
                    {inc.q2_versions.first?.version === r.version && (
                      <span className="ml-2 rounded bg-orange-500/20 px-1 font-mono text-[10px] text-orange-300">first</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtUtc(r.published_at_iso)}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.live_to_kind === "unbounded" ? "still live" : fmtUtc(r.live_to_iso)}{" "}
                    <Kind kind={r.live_to_kind} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.removed ? <span className="text-red-300">removed from registry</span> : <span className="text-zinc-400">on registry</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <HydraCard title="which version" cypher={inc.q2_versions.cypher} ms={inc.q2_versions.ms} rows={inc.q2_versions.rows.length} />
        <Limits items={inc.q2_versions.limitations} />
      </section>

      {/* Q3 */}
      <section>
        <SectionTitle n="3" title="Which apps resolved the bad version while it was live?" star />
        {q3 === null ? (
          <div className="rounded border border-zinc-800 p-4 text-sm text-zinc-400">
            Not applicable: this is a CVE, the artifact is still on the registry, so exposure is not time-bounded.
            “Resolved while live” collapses into “resolved at all” — see question 1.
          </div>
        ) : (
          <>
            <Timeline rows={q3.rows} versions={inc.q2_versions.rows} advisoryPublished={inc.advisory.published_at} />
            <div className="mt-3 overflow-x-auto rounded border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-left text-xs text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">service</th>
                    <th className="px-3 py-2">lockfile committed</th>
                    <th className="px-3 py-2">version</th>
                    <th className="px-3 py-2">evidence</th>
                    <th className="px-3 py-2">window</th>
                  </tr>
                </thead>
                <tbody>
                  {q3.rows.map((r, i) => (
                    <tr key={i} className="border-t border-zinc-800/80">
                      <td className="px-3 py-2 font-mono">
                        <Link href={`/incident/${inc.advisory.key}/${svcSlug(r.service)}`} className="hover:text-orange-300">
                          {svcSlug(r.service)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.sha.slice(0, 12)} · {fmtUtc(r.resolved_at_iso)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{short(r.version)}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.evidence.includes("in_window") && <span className="mr-2 text-amber-300">in window</span>}
                        {r.evidence.includes("pinned_removed") && <span className="text-red-300">pins a removed version</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
                        {fmtUtc(r.live_from_iso)} → {fmtUtc(r.live_to_iso)} <Kind kind={r.live_to_kind} />
                      </td>
                    </tr>
                  ))}
                  {q3.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                        No seed lockfile was committed inside the window or pins a removed version.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <HydraCard title="resolved while live" cypher={q3.cypher} ms={q3.ms} rows={q3.rows.length} />
            <Limits items={[q3.note ?? "", ...q3.limitations].filter(Boolean)} />
          </>
        )}
      </section>

      {/* Q4 */}
      <section>
        <SectionTitle n="4" title="Which packages share maintainers or infrastructure?" star />
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {inc.q4_maintainers.maintainers.map((m) => (
            <span key={m.login} className="rounded border border-zinc-700 px-2 py-1 font-mono">
              {short(m.login)}{" "}
              <span className="text-zinc-500">
                · 2FA {m.twofa === null ? "unknown" : m.twofa ? "on" : "off"}
              </span>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2">co-maintained package</th>
                <th className="px-3 py-2">weekly downloads</th>
                <th className="px-3 py-2">services resolving it today</th>
              </tr>
            </thead>
            <tbody>
              {inc.q4_maintainers.rows.slice(0, 15).map((r) => (
                <tr key={r.package} className="border-t border-zinc-800/80">
                  <td className="px-3 py-2 font-mono">{short(r.package)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-xs text-zinc-400">{r.downloads?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <span className="mr-2 tabular-nums">{r.services_at_risk.length}</span>
                    <span className="text-zinc-500">{r.services_at_risk.map(svcSlug).join(", ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <HydraCard title="maintainer fan-out" cypher={inc.q4_maintainers.cypher} ms={inc.q4_maintainers.ms} rows={inc.q4_maintainers.rows.length} />
        <Limits items={inc.q4_maintainers.limitations} />
      </section>

      {/* Q5 */}
      <section>
        <SectionTitle n="5" title="Are there likely typosquats nearby?" star />
        {Object.entries(inc.q5_typosquats).map(([pkg, sec]) => (
          <div key={pkg} className="mb-4">
            <div className="mb-1 font-mono text-xs text-zinc-400">near {short(pkg)}</div>
            {sec.rows.length === 0 ? (
              <div className="rounded border border-zinc-800 px-3 py-2 text-xs text-zinc-500">no near-names in the ingested corpus</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sec.rows.slice(0, 12).map((r) => (
                  <span key={r.package} className="rounded border border-zinc-700 px-2 py-1 font-mono text-xs">
                    {short(r.package)} <span className="text-zinc-500">· {r.kind} · d{r.distance}</span>
                  </span>
                ))}
              </div>
            )}
            <HydraCard title={`near-names of ${short(pkg)}`} cypher={sec.cypher} ms={sec.ms} rows={sec.rows.length} />
            <Limits items={sec.limitations} />
          </div>
        ))}
      </section>

      {/* Q6 */}
      <section>
        <SectionTitle n="6" title="Complete blast radius" />
        <p className="text-sm text-zinc-400">
          Everything above, on one page: {h.services_exposed} services across {h.lockfiles_exposed} lockfile snapshots
          {q3 ? `, ${q3.services.length} of them with a lockfile committed while the artifact was installable` : ""},
          {inc.q4_maintainers.rows.length} co-maintained packages in the fan-out
          {h.unscanned > 0 ? `, ${h.unscanned} services still unscanned for reachability` : ""}. Total compose time{" "}
          <span className="font-mono">{fmtMs(inc.timing_ms.total)}</span>.
        </p>
      </section>

      <Provenance inc={inc} />
    </div>
  );
}

function rank(inc: Awaited<ReturnType<typeof readIncident>> & object, svc: string) {
  const lv = inc.q7_reachability[svc]?.level ?? "unscanned";
  return { L2: 3, L1: 2, unscanned: 1, L0: 0 }[lv] ?? 0;
}

function SectionTitle({ n, title, star }: { n: string; title: string; star?: boolean }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-3">
      <span className="font-mono text-xs text-orange-400">{`Q${n}`}</span>
      <span className="text-lg font-medium">{title}</span>
      {star && <span className="text-xs text-zinc-500">★ differentiator</span>}
    </h2>
  );
}

function Provenance({ inc }: { inc: NonNullable<Awaited<ReturnType<typeof readIncident>>> }) {
  const p = inc.provenance;
  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-400">
      <div className="mb-2 font-medium text-zinc-300">Provenance</div>
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
        <div>generated {fmtUtc(p.generated_at)}</div>
        <div>engine {p.hydradb_image ?? "ghcr.io/hydra-db/hydradb (digest not recorded)"}</div>
        <div>bolt {p.bolt_uri}</div>
        <div>host {p.host} · {p.platform}</div>
        <div className="md:col-span-2 font-mono">
          graph: {Object.entries(p.graph).map(([k, v]) => `${k} ${v?.toLocaleString() ?? "n/a"}`).join(" · ")}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">{p.note}</p>
    </section>
  );
}
