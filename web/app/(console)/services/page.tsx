import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Activity, Info } from "lucide-react";
import { listIncidents, svcSlug } from "@/lib/incident";
import { services, jobs, type Service } from "@/lib/api";
import { Chip } from "@/components/console/ui";
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
      // any comment line starts a new section; only the two disclosed cohorts get a chip
      if (line.startsWith("#")) cur = /^#\s*(core|victim)\s*$/.test(line) ? line.replace(/^#\s*/, "") : "";
      else if (line && !line.startsWith("#") && cur) m.set(line.split(/\s+/)[0].toLowerCase(), cur);
    }
  } catch {
    /* no demo file on this deploy — no chips */
  }
  return m;
}

// Token table: th 10.5px uppercase tracked --dim on a --border rule; td 12.5px --mut on --line rules.
const TABLE =
  "w-full min-w-[880px] border-collapse [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:pb-[9px] [&_th]:pt-3.5 [&_th]:text-left [&_th]:text-[10.5px] [&_th]:font-medium [&_th]:uppercase [&_th]:leading-none [&_th]:tracking-[0.09em] [&_th]:text-dim [&_td]:whitespace-nowrap [&_td]:border-b [&_td]:border-line [&_td]:p-3 [&_td]:align-middle [&_td]:text-[12.5px] [&_td]:text-mut [&_tbody_tr:last-child_td]:border-b-0";

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
    <div className="mx-auto max-w-[1280px] px-10 pb-24 pt-9 max-[900px]:px-5">
      <h1 className="text-[22px] font-medium leading-[1.25] tracking-[-0.015em] text-fg">Services</h1>
      <p className="mt-2 text-[12.5px] text-mut text-pretty">
        {live ? (
          <>
            <span className="num">{list.length}</span> repositor{list.length === 1 ? "y" : "ies"} watched · lockfile history ingested per commit · badge per repo.
          </>
        ) : (
          "live API unavailable — the registry lives in the graph and cannot be read right now."
        )}
      </p>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3.5 max-[900px]:grid-cols-1">
        <AddRepository disabled={!live} recent={recentSorted} prominent={empty} />
      </div>

      {empty ? (
        <div className="elev mt-3.5 flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-10 text-center">
          <span className="grid size-8 place-items-center rounded-full border border-border text-dim">
            <Activity className="size-3.5" />
          </span>
          <p className="max-w-[44ch] font-mono text-[11.5px] leading-[1.6] text-dim text-pretty">nothing is watched yet · add a repository above and its lockfile history becomes the first service in the graph.</p>
        </div>
      ) : (
        live && (
          <div className="elev mt-3.5 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between border-b border-line px-[18px] py-4">
              <span className="label">watched services</span>
              <span className="num text-[11px] leading-none text-dim">{list.length} rows</span>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className={TABLE}>
                <thead className="sticky top-0 z-[2] bg-card shadow-[inset_0_-1px_0_var(--color-border)]">
                  <tr>
                    <th>repository</th>
                    <th>cohort</th>
                    <th>lockfiles</th>
                    <th>latest commit</th>
                    <th>incidents</th>
                    <th>while live</th>
                    <th>badge</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => {
                    const slug = svcSlug(s.key);
                    const e = exposure.get(s.key);
                    const co = cohort.get(slug.toLowerCase());
                    const lc = typeof s.latest_commit === "object" ? s.latest_commit : null;
                    return (
                      <tr key={s.key} className="transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover">
                        <td className="font-mono text-[12px] text-fg" title={s.note ?? undefined}>
                          <a href={s.repo_url || `https://github.com/${slug}`} className="text-fg hover:text-signal-2" target="_blank" rel="noreferrer">
                            {slug}
                          </a>
                        </td>
                        <td>{co ? <Chip>{co}</Chip> : <span className="text-dim">—</span>}</td>
                        <td className="num">{s.lockfiles}</td>
                        <td className="num text-[11.5px]">
                          <span title={sha(s.latest_commit) ?? undefined}>{shortSha(sha(s.latest_commit))}</span>
                          {lc && <> · {day(lc.committed_at_iso ?? lc.committed_at)}</>}
                        </td>
                        <td className="num text-[11.5px]">{e ? <Link href="/board">{e.incidents}</Link> : <span className="text-dim">0</span>}</td>
                        <td className="num text-[11.5px]">{e?.whileLive ? <span className="text-l1">{e.whileLive}</span> : <span className="text-dim">0</span>}</td>
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
          </div>
        )
      )}

      {!live && (
        <div className="mt-3.5 flex items-center gap-3.5 rounded-xl border border-dashed border-input p-[18px]">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-dim">
            <Info className="size-3.5" />
          </span>
          <p className="font-mono text-[11.5px] leading-[1.6] text-dim text-pretty">
            degraded · the live API is unreachable, so the watched list and its commit metadata cannot be read; incident counts on this deploy come from the last committed graph snapshot. Nothing here is estimated.
          </p>
        </div>
      )}
    </div>
  );
}
