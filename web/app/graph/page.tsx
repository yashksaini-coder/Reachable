import { graphStats, jobs, services as listServices, type GraphStats, type Job } from "@/lib/api";
import { GraphExplorer } from "./explorer";
import { fmtMs } from "@/lib/incident";
import { Stat } from "@/app/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Graph" };

// Our model on screen: what is in the store, how it is shaped, and how it got there.
// Everything here is live from the worker API; when it is down we say so, never a cached number.

const LABELS = ["Service", "Lockfile", "Package", "Version", "Advisory", "Maintainer", "File"];

// Hand-typed from docs/schema.md — the frozen schema, not an introspection.
const SCHEMA: [string, string, string, string][] = [
  ["Version", "VERSION_OF", "Package", "registry"],
  ["Version", "DEPENDS_ON", "Version", "lockfile · range"],
  ["Maintainer", "MAINTAINS", "Package", "registry"],
  ["Advisory", "AFFECTS", "Version", "OSV + registry · live_from, live_to, live_to_kind"],
  ["Service", "HAS_LOCKFILE", "Lockfile", "GitHub"],
  ["Lockfile", "RESOLVED", "Version", "lockfile · at (= committed_at)"],
  ["Service", "CONTAINS", "File", "import scan at exposed commit"],
  ["File", "IMPORTS", "Package", "import scan · line"],
  ["Package", "NAME_SIMILAR_TO", "Package", "typosquat.py at ingest · distance, kind"],
];

const STATUS: Record<string, string> = { done: "text-l0", ok: "text-l0", running: "text-signal", failed: "text-l2", error: "text-l2" };
const DOT: Record<string, string> = { done: "bg-l0", ok: "bg-l0", running: "bg-signal", failed: "bg-l2", error: "bg-l2" };

const when = (t: string | number | null | undefined) =>
  t == null ? "—" : new Date(typeof t === "number" ? t * 1000 : t).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");

export default async function GraphPage() {
  const [stats, list, svcs]: [GraphStats | null, Job[] | null, Awaited<ReturnType<typeof listServices>>] = await Promise.all([graphStats(), jobs(), listServices()]);
  const names = (svcs ?? []).map((s) => s.key.replace(/^svc:/, "")).sort();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Graph</h1>
        <span className="text-[13px] text-muted-foreground">
          what is in HydraDB right now · counted live over Bolt
        </span>
      </header>

      {svcs && names.length > 0 && <GraphExplorer services={names} initial={{ service: names[0] }} />}

      {!stats ? (
        <Unavailable what="counts" />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {LABELS.map((l) => {
            const n = stats.nodes?.[l];
            return <Stat key={l} n={n == null ? "n/a" : n.toLocaleString()} label={n == null ? `${l} — count refused past 250k` : l} />;
          })}
        </div>
      )}
      {stats && (
        <p className="font-mono text-[11px] text-muted-foreground">
          last ingest {when(stats.last_ingest)}
          {stats.edges_written &&
            Object.entries(stats.edges_written).map(([k, v]) => (
              <span key={k}>
                {" "}
                · {k} <span className="num">{v.toLocaleString()}</span>
              </span>
            ))}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-[15px] font-medium tracking-tight">Schema</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[12px] [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
            <thead>
              <tr>
                <th>from</th>
                <th>relationship</th>
                <th>to</th>
                <th>source · edge properties</th>
              </tr>
            </thead>
            <tbody>
              {SCHEMA.map(([a, r, b, src]) => (
                <tr key={r + a + b}>
                  <td className="font-mono">{a}</td>
                  <td className="font-mono text-signal-2">{r}</td>
                  <td className="font-mono">{b}</td>
                  <td className="text-muted-foreground">{src}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ids are 52-bit <code>gid(key)</code> integers; every node carries its human <code>key</code>. Timestamps are int epoch seconds. Full
          rules in <code>docs/schema.md</code>.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-medium tracking-tight">Ingest jobs</h2>
        {!list ? (
          <Unavailable what="jobs" />
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">
            No jobs yet — add a repository on Services or run <code>make add REPO=owner/repo</code>.
          </div>
        ) : (
          <ol className="space-y-2">
            {list.map((j) => (
              <li key={j.job_id} className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                  <span className="font-mono">{j.repo}</span>
                  <span className={cn("font-mono text-[11px] uppercase tracking-wide", STATUS[j.status] ?? "text-muted-foreground")}>{j.status}</span>
                  {j.step && j.status === "running" && <span className="text-[11px] text-muted-foreground">at {j.step}</span>}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {when(j.started_at)} → {when(j.ended_at)} · {j.job_id}
                  </span>
                </div>
                <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                  {(j.steps ?? []).map((s) => (
                    <li key={s.name} className="flex items-baseline gap-1.5" title={s.detail ?? undefined}>
                      <span className={cn("size-1.5 rounded-full", DOT[s.status] ?? "bg-unknown")} aria-hidden />
                      <span>{s.name}</span>
                      <span className="num whitespace-nowrap text-muted-foreground">{s.ms == null ? "—" : fmtMs(s.ms)}</span>
                      {s.detail && <span className="text-muted-foreground">· {s.detail}</span>}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Unavailable({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-l1/25 bg-l1/5 px-4 py-3 text-[13px] text-l1/90">
      Live API unavailable — {what} not shown. Start it with <code>make up</code>; nothing here is served from cache.
    </div>
  );
}
