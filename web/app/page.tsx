import Link from "next/link";
import { listIncidents, fmtMs, fmtUtc } from "@/lib/incident";

export const dynamic = "force-static";

export default async function Home() {
  const incidents = await listIncidents();
  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Everyone else ships more alerts. <span className="text-orange-400">We ship fewer, with proof.</span>
        </h1>
        <p className="mt-3 text-zinc-400">
          When an npm package is compromised: which of your services are transitively exposed, which resolved the bad
          version <em>while it was live</em>, which packages share its maintainers, which nearby names are typosquats —
          and which of those exposures are actually reachable from first-party code. Each answer is one traversal inside
          HydraDB, with the executed Cypher shown under it.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Incidents</h2>
        {incidents.length === 0 && (
          <div className="rounded border border-zinc-800 p-6 text-sm text-zinc-400">
            No incident JSON committed yet. Run <code className="text-zinc-200">make incident ID=… --out</code>.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {incidents.map((inc) => (
            <Link
              key={inc.advisory.key}
              href={`/incident/${inc.advisory.key}`}
              className="group rounded border border-zinc-800 bg-zinc-900/40 p-5 transition hover:border-orange-500/50"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm text-orange-300">{inc.advisory.key}</span>
                <span className="rounded border border-zinc-700 px-1.5 font-mono text-[10px] uppercase text-zinc-400">
                  {inc.advisory.kind} · {inc.advisory.severity}
                </span>
              </div>
              <div className="mt-1 text-sm text-zinc-300">{inc.advisory.summary}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                <div>
                  <div className="text-2xl">{inc.headline.services_exposed}</div>
                  <div className="text-zinc-500">services exposed</div>
                </div>
                <div>
                  <div className="text-2xl text-amber-300">
                    {inc.headline.resolved_while_live ?? "n/a"}
                  </div>
                  <div className="text-zinc-500">resolved while live</div>
                </div>
                <div>
                  <div className="text-2xl text-red-300">{inc.headline.reachable_L2}</div>
                  <div className="text-zinc-500">reachable (L2)</div>
                </div>
              </div>
              <div className="mt-4 flex justify-between text-[11px] text-zinc-500">
                <span>published {fmtUtc(inc.advisory.published_at_iso)}</span>
                <span>
                  blast radius {fmtMs(inc.q1_exposed.timing.cold_ms)} cold · {fmtMs(inc.q1_exposed.timing.warm_p50_ms)} warm
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3 text-sm text-zinc-400">
        <div>
          <h3 className="mb-1 font-medium text-zinc-200">Lockfile is a node</h3>
          Exposure is a fact <em>as of a commit</em>. Every <code>package-lock.json</code> snapshot is a time-stamped node whose
          RESOLVED edges are the flattened tree npm actually installed — so “who resolved it while it was live” is one
          predicate comparing two relationship properties, in-engine.
        </div>
        <div>
          <h3 className="mb-1 font-medium text-zinc-200">One call, many sources</h3>
          <code>algo.MSpaths</code> takes every compromised version and every service in a single reverse traversal. No
          client-side fan-out; the proving path comes back from the engine.
        </div>
        <div>
          <h3 className="mb-1 font-medium text-zinc-200">Honest windows</h3>
          <code>live_from</code> is exact — npm keeps the publish timestamp after erasing a version.{" "}
          <code>live_to</code> is an upper bound and is labelled as one on every row. Unknowns are shown as unknown.
        </div>
      </section>
    </div>
  );
}
