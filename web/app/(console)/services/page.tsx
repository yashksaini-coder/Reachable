import Link from "next/link";
import Image from "next/image";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Unplug } from "lucide-react";
import { listIncidents, svcSlug } from "@/lib/incident";
import { services, jobs, type Service } from "@/lib/api";
import { Chip } from "@/components/console/ui";
import { StateView } from "@/components/console/states";
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
  "w-full min-w-[880px] border-collapse [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:pb-[9px] [&_th]:pt-3.5 [&_th]:text-left [&_th]:text-[11.5px] [&_th]:font-medium [&_th]:uppercase [&_th]:leading-none [&_th]:tracking-[0.09em] [&_th]:text-dim [&_td]:h-10 [&_td]:whitespace-nowrap [&_td]:border-b [&_td]:border-line [&_td]:p-3 [&_td]:align-middle [&_td]:text-[13.5px] [&_td]:text-mut [&_tbody_tr:last-child_td]:border-b-0";

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
  const jobsSorted = [...(recent ?? [])].sort((a, b) => Number(b.started_at ?? 0) - Number(a.started_at ?? 0));
  // Latest job per repo (jobs are newest first). A service whose latest job did not finish is
  // flagged partial: some steps may have written, later ones did not.
  const latestJob = new Map<string, (typeof jobsSorted)[number]>();
  for (const j of jobsSorted) if (!latestJob.has(j.repo.toLowerCase())) latestJob.set(j.repo.toLowerCase(), j);
  const empty = live && list.length === 0;

  // Dashboard: at >=900px the page is exactly one viewport tall — header, the fixed top row, and the
  // watched-services table taking the rest and scrolling inside itself. Below 900px it flows and
  // scrolls normally. On viewports too short for the top row, main falls back to scrolling.
  return (
    <div className="mx-auto w-full max-w-[1280px] px-10 pb-24 pt-9 max-[900px]:px-5 min-[900px]:flex min-[900px]:h-full min-[900px]:min-h-0 min-[900px]:flex-col min-[900px]:pb-6">
      <h1 className="text-[24px] font-medium leading-[1.25] tracking-[-0.015em] text-fg">Services</h1>
      <p className="mt-2 text-[13.5px] text-mut text-pretty">
        {live ? (
          <>
            <span className="num">{list.length}</span> repositor{list.length === 1 ? "y" : "ies"} watched · lockfile history ingested per commit · badge per repo.
          </>
        ) : (
          "live API unavailable — the registry lives in the graph and cannot be read right now."
        )}
      </p>

      <div className="mt-6 grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-3.5 max-[900px]:grid-cols-1">
        <AddRepository disabled={!live} recent={jobsSorted} prominent={empty} />
      </div>

      {empty ? (
        <div className="elev mt-3.5 flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-10 text-center">
          <Image src="/art/reachable-path-512.png" alt="" width={256} height={256} className="pixel opacity-90" unoptimized />
          <p className="max-w-[44ch] font-mono text-[12.5px] leading-[1.6] text-dim text-pretty">nothing is watched yet · add a repository above and its lockfile history becomes the first service in the graph.</p>
        </div>
      ) : (
        live && (
          <div className="elev mt-3.5 flex flex-col overflow-hidden rounded-xl border border-border bg-card min-[900px]:min-h-[160px] min-[900px]:flex-1">
            <div className="flex items-baseline justify-between border-b border-line px-[18px] py-4">
              <span className="label">watched services</span>
              <span className="num text-[12px] leading-none text-dim">{list.length} rows</span>
            </div>
            <div className="max-h-[420px] overflow-auto min-[900px]:max-h-none min-[900px]:min-h-0 min-[900px]:flex-1">
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
                    const lj = latestJob.get(slug.toLowerCase());
                    const partial = lj && (lj.status === "failed" || lj.status === "interrupted");
                    return (
                      <tr key={s.key} className="transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover">
                        <td className="font-mono text-[13px] text-fg" title={s.note ?? slug}>
                          <a href={s.repo_url || `https://github.com/${slug}`} className="inline-block max-w-[260px] truncate align-middle text-fg hover:text-signal-2" target="_blank" rel="noreferrer" title={slug}>
                            {slug}
                          </a>
                          {partial && (
                            <span className="ml-2 font-mono text-[11.5px] text-signal-2" title={lj.error ?? `latest job ${lj.status}`}>
                              partial · retry
                            </span>
                          )}
                        </td>
                        <td>{co ? <Chip>{co}</Chip> : <span className="text-dim">—</span>}</td>
                        <td className="num">{s.lockfiles}</td>
                        <td className="num text-[12.5px]">
                          <span title={sha(s.latest_commit) ?? undefined}>{shortSha(sha(s.latest_commit))}</span>
                          {lc && <> · {day(lc.committed_at_iso ?? lc.committed_at)}</>}
                        </td>
                        <td className="num text-[12.5px]">{e ? <Link href="/board">{e.incidents}</Link> : <span className="text-dim">0</span>}</td>
                        <td className="num text-[12.5px]">{e?.whileLive ? <span className="text-l1">{e.whileLive}</span> : <span className="text-dim">0</span>}</td>
                        <td>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/badge/${slug}.svg`} alt={`reachable badge for ${slug}`} width={168} height={22} className="block h-[22px] w-auto" />
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
        <StateView
          icon={Unplug}
          sentence="degraded — the live API is unreachable, so the watched list cannot be read."
          hint="incident counts on this deploy come from the last committed graph snapshot · nothing here is estimated"
          className="mt-3.5 min-h-[160px] rounded-xl border border-dashed border-input p-[18px]"
        />
      )}
    </div>
  );
}
