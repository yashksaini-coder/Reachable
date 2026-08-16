import Link from "next/link";
import { listIncidents, svcSlug } from "@/lib/incident";
import { services, jobs, type Service } from "@/lib/api";
import { AddRepository } from "./add-repository";

// Services live in the graph; this page reads them from the worker API and degrades honestly
// when it is unreachable (list nothing, form disabled). Incident counts come from committed JSON.
export const dynamic = "force-dynamic";

const sha = (c: Service["latest_commit"]) => (typeof c === "string" ? c : (c?.sha ?? null));
const shortSha = (sha?: string | null) => (sha ? sha.slice(0, 7) : "—");
const day = (v?: string | number | null) => {
  if (v == null || v === "") return "—";
  const d = typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};

export default async function Services() {
  const [svcs, recent, incidents] = await Promise.all([services(), jobs(), listIncidents()]);
  const exposure = new Map<string, { incidents: number; whileLive: number }>();
  for (const inc of incidents) {
    for (const svc of inc.q1_exposed.services) {
      const e = exposure.get(svc) ?? { incidents: 0, whileLive: 0 };
      e.incidents += 1;
      if (inc.q3_while_live?.services.includes(svc)) e.whileLive += 1;
      exposure.set(svc, e);
    }
  }
  const live = svcs !== null;
  const list = svcs ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Services</h1>
        <span className="text-[13px] text-muted-foreground">
          {live ? `${list.length} repositories watched · lockfile history ingested per commit · badge per repo` : "live API unavailable — the registry lives in the graph and cannot be read right now"}
        </span>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[820px] text-[13px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_td]:h-11 [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-0 [&_td]:align-middle [&_td]:whitespace-nowrap">
          <thead>
            <tr>
              <th>repository</th>
              <th className="text-right">lockfiles</th>
              <th>latest commit</th>
              <th className="text-right">incidents</th>
              <th className="text-right">while live</th>
              <th>badge</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground">
                  {live ? "No repositories yet — add one below." : "—"}
                </td>
              </tr>
            )}
            {list.map((s) => {
              const slug = svcSlug(s.key);
              const e = exposure.get(s.key);
              return (
                <tr key={s.key}>
                  <td className="font-mono" title={s.note ?? undefined}>
                    <a href={s.repo_url || `https://github.com/${slug}`} className="hover:text-signal-2" target="_blank" rel="noreferrer">
                      {slug}
                    </a>
                  </td>
                  <td className="num text-right text-muted-foreground">{s.lockfiles}</td>
                  <td className="num text-muted-foreground">
                    <span className="font-mono text-foreground/80" title={sha(s.latest_commit) ?? undefined}>{shortSha(sha(s.latest_commit))}</span>
                    {typeof s.latest_commit === "object" && s.latest_commit && (
                      <span> · {day(s.latest_commit.committed_at_iso ?? s.latest_commit.committed_at)}</span>
                    )}
                  </td>
                  <td className="num text-right">
                    {e ? (
                      <Link href="/board" className="hover:text-signal-2">
                        {e.incidents}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="num text-right">{e?.whileLive ? <span className="text-l1">{e.whileLive}</span> : <span className="text-muted-foreground">0</span>}</td>
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/badge/${slug}.svg`} alt={`reachable badge for ${slug}`} height={20} className="block" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddRepository disabled={!live} recent={[...(recent ?? [])].sort((a, b) => Number(b.started_at ?? 0) - Number(a.started_at ?? 0)).slice(0, 5)} />
    </div>
  );
}
