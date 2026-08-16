import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { listIncidents, svcSlug } from "@/lib/incident";

export const dynamic = "force-static";

type Seed = { slug: string; criticality: number; cohort: string; lockfile_commits?: number; history_from?: string; note?: string };

// The watched services come from seeds.json (disclosed dataset). Adding a service is an
// ingest step today: add it to seeds.json and run `make ingest ARGS="--only services"`.
async function seeds(): Promise<Seed[]> {
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), "..", "seeds.json"), "utf8");
    return (JSON.parse(raw) as { services: Seed[] }).services;
  } catch {
    return [];
  }
}

export default async function Services() {
  const [svcs, incidents] = await Promise.all([seeds(), listIncidents()]);
  const exposure = new Map<string, { incidents: number; worst: string; whileLive: number }>();
  for (const inc of incidents) {
    for (const svc of inc.q1_exposed.services) {
      const e = exposure.get(svc) ?? { incidents: 0, worst: "unscanned", whileLive: 0 };
      e.incidents += 1;
      const lv = inc.q7_reachability[svc]?.level ?? "unscanned";
      const rank: Record<string, number> = { L2: 3, L1: 2, unscanned: 1, L0: 0 };
      if ((rank[lv] ?? 0) > (rank[e.worst] ?? 0)) e.worst = lv;
      if (inc.q3_while_live?.services.includes(svc)) e.whileLive += 1;
      exposure.set(svc, e);
    }
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Services</h1>
        <span className="text-[13px] text-ink-2">
          {svcs.length} repositories watched · lockfile history ingested per commit · badge per repo
        </span>
      </header>
      <div className="panel overflow-x-auto">
        <table className="data w-full text-[13px]">
          <thead>
            <tr>
              <th>repository</th>
              <th>cohort</th>
              <th>lockfile history</th>
              <th>incidents</th>
              <th>while live</th>
              <th>badge</th>
            </tr>
          </thead>
          <tbody>
            {svcs.map((s) => {
              const key = `svc:${s.slug}`;
              const e = exposure.get(key);
              return (
                <tr key={s.slug}>
                  <td className="font-mono">
                    <a href={`https://github.com/${s.slug}`} className="link" target="_blank" rel="noreferrer">
                      {s.slug}
                    </a>
                    {s.note && <div className="mt-0.5 max-w-md text-[11px] text-ink-3">{s.note}</div>}
                  </td>
                  <td>
                    <span className={`chip ${s.cohort === "victim" ? "chip-accent" : ""}`}>{s.cohort}</span>
                  </td>
                  <td className="num text-ink-2">
                    {s.lockfile_commits ?? "—"} commits{s.history_from ? ` since ${s.history_from}` : ""}
                  </td>
                  <td className="num">
                    {e ? (
                      <Link href="/board" className="link">
                        {e.incidents}
                      </Link>
                    ) : (
                      <span className="text-ink-3">0</span>
                    )}
                  </td>
                  <td className="num">{e?.whileLive ? <span className="text-l1">{e.whileLive}</span> : <span className="text-ink-3">0</span>}</td>
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/badge/${s.slug}.svg`} alt={`reachable badge for ${svcSlug(key)}`} height={20} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="panel-2 px-4 py-3 text-[12.5px] text-ink-2">
        <div className="mb-1 font-medium text-ink">Add a repository</div>
        Add it to <code>seeds.json</code> and run <code>make ingest ARGS=&quot;--only services --only packages --only advisories --only reach&quot;</code>.
        The pipeline is idempotent and disk-cached: re-running it never duplicates anything and only fetches what is new.
        Then <code>make incident ID=&lt;advisory&gt; ARGS=&quot;--out&quot;</code> refreshes the incident pages and this board.
      </section>
    </div>
  );
}
