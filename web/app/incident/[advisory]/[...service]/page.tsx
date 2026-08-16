import Link from "next/link";
import { notFound } from "next/navigation";
import { readIncident, listIncidents, short, svcSlug, fmtUtc } from "@/lib/incident";
import { HydraCard, Level, Limits } from "@/app/ui";

export const dynamic = "force-static";
export async function generateStaticParams() {
  const out: { advisory: string; service: string[] }[] = [];
  for (const inc of await listIncidents())
    for (const s of inc.q1_exposed.services) out.push({ advisory: inc.advisory.key, service: svcSlug(s).split("/") });
  return out;
}

export default async function ServicePage({ params }: PageProps<"/incident/[advisory]/[...service]">) {
  const { advisory, service } = await params;
  const inc = await readIncident(advisory);
  if (!inc) notFound();
  const key = `svc:${service.map(decodeURIComponent).join("/")}`;
  const rows = inc.q1_exposed.rows.filter((r) => r.service === key);
  if (rows.length === 0) notFound();
  const reach = inc.q7_reachability[key];
  const level = reach?.level ?? "unscanned";
  const live = (inc.q3_while_live?.rows ?? []).filter((r) => r.service === key);

  const verdict: Record<string, string> = {
    L2: "Act now. First-party code references a vulnerable symbol from the compromised package.",
    L1: "Low risk. First-party code imports the package but does not reference the vulnerable symbol.",
    L0: "Deprioritise. The package is in the install tree but no scanned file imports it.",
    unscanned: "Unknown. No source files were ingested for this service, so reachability could not be assessed — this is not a clean bill of health.",
  };

  return (
    <div className="space-y-8">
      <div className="text-xs text-ink-3">
        <Link href={`/incident/${inc.advisory.key}`} className="hover:text-ink">
          {inc.advisory.key}
        </Link>{" "}
        / {svcSlug(key)}
      </div>
      <header>
        <h1 className="font-mono text-2xl">{svcSlug(key)}</h1>
        <div className="mt-2 flex items-center gap-3">
          <Level level={level} />
          <span className="text-sm text-ink-2">{verdict[level]}</span>
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink">Why this service is exposed</h2>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.lockfile} className="rounded border border-line bg-panel p-4">
              <div className="flex flex-wrap items-baseline gap-3 font-mono text-xs">
                <span className="text-ink-2">lockfile {r.sha.slice(0, 12)}</span>
                <span className="text-ink-3">committed {fmtUtc(new Date(r.committed_at * 1000).toISOString())}</span>
                <span className="text-ink-3">
                  resolves {r.bad_versions.map(short).join(", ")}
                </span>
                {live.some((l) => l.lockfile === r.lockfile) && (
                  <span className="rounded bg-l1/15 px-1.5 text-l1">resolved while live</span>
                )}
              </div>
              <div className="mt-3 space-y-1">
                {r.paths.length === 0 && <div className="text-xs text-ink-3">direct RESOLVED edge (no explanation path requested)</div>}
                {r.paths.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1 font-mono text-xs">
                    {p.chain.map((el, j) =>
                      j % 2 === 0 ? (
                        <span
                          key={j}
                          className={`rounded px-1.5 py-0.5 ${
                            j === 0 ? "bg-l2/15 text-l2" : j === p.chain.length - 1 ? "bg-panel-2 text-ink" : "bg-panel-2 text-ink-2"
                          }`}
                        >
                          {short(el)}
                        </span>
                      ) : (
                        <span key={j} className="text-ink-3">
                          ←{el}←
                        </span>
                      ),
                    )}
                    <span className="ml-2 text-ink-3">
                      {p.hops === 0 ? "direct dependency" : `${p.hops} hop${p.hops === 1 ? "" : "s"}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <HydraCard title="proving path" cypher={inc.q1_exposed.cypher} ms={inc.q1_exposed.ms} rows={inc.q1_exposed.rows.length} />
      </section>

      {reach && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink">Reachability</h2>
          <div className="rounded border border-line bg-panel p-4 text-sm">
            <div className="text-xs text-ink-2">{reach.files_scanned} first-party files scanned</div>
            {reach.imports.length > 0 && (
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {reach.imports.map((i, k) => (
                  <li key={k}>
                    {i.path}:{i.line} <span className="text-ink-3">imports {short(i.package)}</span>
                  </li>
                ))}
              </ul>
            )}
            {reach.symbols.length > 0 && (
              <ul className="mt-2 space-y-1 font-mono text-xs text-l2">
                {reach.symbols.map((s, k) => (
                  <li key={k}>
                    {s.path}:{s.line} uses {s.symbol}
                    {s.inferred && <span className="ml-2 text-ink-3">(symbol inferred from advisory prose)</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <HydraCard title="reachability" cypher={reach.cypher} ms={reach.ms} rows={reach.imports.length + reach.symbols.length} />
          <Limits items={reach.limitations} />
        </section>
      )}

      {live.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink">Resolved while live</h2>
          <ul className="space-y-1 font-mono text-xs">
            {live.map((l, i) => (
              <li key={i} className="rounded border border-line px-3 py-2">
                {l.sha.slice(0, 12)} · committed {fmtUtc(l.resolved_at_iso)} · {short(l.version)} ·{" "}
                <span className={l.evidence.includes("in_window") ? "text-l1" : "text-l2"}>{l.evidence.replace("+", " + ")}</span>
                <span className="text-ink-3">
                  {" "}
                  · window {fmtUtc(l.live_from_iso)} → {fmtUtc(l.live_to_iso)} ({l.live_to_kind.replace("_", " ")})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
