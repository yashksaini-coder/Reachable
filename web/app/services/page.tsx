import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Activity } from "lucide-react";
import { listIncidents, svcSlug } from "@/lib/incident";
import { services, jobs, type Service } from "@/lib/api";
import { Chip } from "@/app/ui";
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

// Disclosed demo cohorts (demo/services.txt: "# core" / "# victim" sections). Display only —
// a repo outside the file simply has no chip. ponytail: re-read per request; the file is tiny.
async function cohorts(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const txt = await fs.readFile(path.resolve(process.cwd(), "..", "demo", "services.txt"), "utf8");
    let cur = "";
    for (const raw of txt.split("\n")) {
      const line = raw.trim();
      if (/^#\s*(core|victim)\s*$/.test(line)) cur = line.replace(/^#\s*/, "");
      else if (line && !line.startsWith("#") && cur) m.set(line.split(/\s+/)[0].toLowerCase(), cur);
    }
  } catch {
    /* no demo file on this deploy — no chips */
  }
  return m;
}

export default async function Services() {
  const [svcs, recent, incidents, cohort] = await Promise.all([services(), jobs(), listIncidents(), cohorts()]);
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
  const recentSorted = [...(recent ?? [])].sort((a, b) => Number(b.started_at ?? 0) - Number(a.started_at ?? 0)).slice(0, 5);
  const empty = live && list.length === 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance">Services</h1>
        <span className="text-[13px] text-muted-foreground text-pretty">
          {live ? (
            <>
              <span className="num">{list.length}</span> repositor{list.length === 1 ? "y" : "ies"} watched · lockfile history ingested per commit · badge per repo
            </>
          ) : (
            "live API unavailable — the registry lives in the graph and cannot be read right now"
          )}
        </span>
      </header>

      {empty ? (
        <div className="elev flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Activity className="size-4" strokeWidth={1.75} />
          </span>
          <p className="max-w-md text-[13px] text-muted-foreground text-pretty">Nothing is being watched yet. Add a repository below and its lockfile history becomes the first service in the graph.</p>
        </div>
      ) : (
        <div className="elev max-h-[70vh] overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[880px] text-[13px] [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[10.5px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.14em] [&_th]:text-muted-foreground [&_th]:shadow-[inset_0_-1px_0_var(--border)] [&_td]:h-11 [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-0 [&_td]:align-middle [&_td]:whitespace-nowrap">
            <thead>
              <tr>
                <th>repository</th>
                <th>cohort</th>
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
                  <td colSpan={7} className="text-center text-muted-foreground">
                    —
                  </td>
                </tr>
              )}
              {list.map((s) => {
                const slug = svcSlug(s.key);
                const e = exposure.get(s.key);
                const co = cohort.get(slug.toLowerCase());
                const lc = typeof s.latest_commit === "object" ? s.latest_commit : null;
                return (
                  <tr key={s.key} className="transition-colors hover:bg-accent/40">
                    <td className="font-mono" title={s.note ?? undefined}>
                      <a
                        href={s.repo_url || `https://github.com/${slug}`}
                        className="rounded-sm transition-colors hover:text-signal-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {slug}
                      </a>
                    </td>
                    <td>{co ? <Chip tone={co === "victim" ? "border-l1/40 text-l1" : ""}>{co}</Chip> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="num text-right text-muted-foreground">{s.lockfiles}</td>
                    <td className="num text-muted-foreground">
                      <span className="text-foreground/80" title={sha(s.latest_commit) ?? undefined}>
                        {shortSha(sha(s.latest_commit))}
                      </span>
                      {lc && <span> · {day(lc.committed_at_iso ?? lc.committed_at)}</span>}
                    </td>
                    <td className="num text-right">
                      {e ? (
                        <Link href="/board" className="rounded-sm transition-colors hover:text-signal-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">
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
      )}

      <AddRepository disabled={!live} recent={recentSorted} prominent={empty} />
    </div>
  );
}
