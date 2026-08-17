import { graphStats, jobs, services as listServices, type GraphStats, type Job } from "@/lib/api";
import { GraphExplorer } from "./explorer";
import { fmtMs } from "@/lib/incident";
import { StatStrip } from "@/components/console/ui";
import { CountUp } from "@/components/console/count-up";
import { cn } from "@/lib/utils";
import { ACTION } from "@/components/console/states";
import Link from "next/link";
import { PlugZap, FolderPlus } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Graph" };

// Our model on screen: what is in the store, how it is shaped, and how it got there.
// Everything here is live from the worker API; when it is down we say so, never a cached number.

// label · lowercase tile label · 2px top rule (graph node palette — colours mean the label, nothing else)
const TILES: [string, string, string][] = [
  ["Service", "services", "bg-node-service"],
  ["Lockfile", "lockfiles", "bg-node-lockfile"],
  ["Version", "versions", "bg-node-version"],
  ["Package", "packages", "bg-node-package"],
  ["Advisory", "advisories", "bg-node-advisory"],
  ["Maintainer", "maintainers", "bg-node-maintainer"],
  ["File", "files", "bg-node-file"],
];

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

// Status dots: green ok · amber queued · red failed · orange running (the only "live" state).
const DOT: Record<string, string> = { done: "bg-l0", ok: "bg-l0", queued: "bg-l1", pending: "bg-l1", running: "bg-signal", failed: "bg-l2", error: "bg-l2" };
const STATUS: Record<string, string> = { done: "text-l0", ok: "text-l0", queued: "text-l1", running: "text-signal", failed: "text-l2", error: "text-l2" };

const when = (t: string | number | null | undefined) =>
  t == null ? "—" : new Date(typeof t === "number" ? t * 1000 : t).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");

export default async function GraphPage() {
  const [stats, list, svcs]: [GraphStats | null, Job[] | null, Awaited<ReturnType<typeof listServices>>] = await Promise.all([graphStats(), jobs(), listServices()]);
  const names = (svcs ?? []).map((s) => s.key.replace(/^svc:/, "")).sort();

  return (
    <div className="mx-auto max-w-[1280px] px-10 pb-24 pt-9 max-[900px]:px-5">
      <h1 className="text-balance text-[22px] font-medium leading-[1.25] tracking-[-0.015em] text-fg">Graph</h1>
      <p className="mt-2 text-[12.5px] text-mut">What HydraDB holds, and how to walk it.</p>

      {/* tiles per label — the true count is server-rendered; CountUp only replays it */}
      {!stats ? (
        <Unavailable what="counts" className="mt-[22px]" />
      ) : (
        <StatStrip min={120} className="mt-[22px]">
          {TILES.map(([l, label, rule], i) => {
            const n = stats.nodes?.[l];
            return (
              <div key={l} className="bg-card px-[13px] pb-[15px] pt-[13px] cell-lines">
                <span aria-hidden className={cn("mb-3 block h-0.5 w-[18px]", rule)} />
                <div className="num text-[22px] font-medium leading-none tracking-[-0.02em] text-fg">{n == null ? <span className="text-dim">n/a</span> : <CountUp n={n} delay={i * 90} />}</div>
                <div className="mt-1.5 text-[10.5px] text-dim">{n == null ? `${label} — count refused past 250k` : label}</div>
              </div>
            );
          })}
        </StatStrip>
      )}
      {stats && (
        <p className="mt-2 font-mono text-[10.5px] leading-[1.6] text-dim">
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

      {/* explorer — needs at least one watched service to seed from */}
      <div className="mt-3.5">
        {!svcs ? (
          <Unavailable what="explorer" />
        ) : names.length === 0 ? (
          <Empty icon={FolderPlus} sentence="No watched services yet — the explorer seeds from one." action="add a repository" className="min-h-[220px] rounded-2xl border border-border bg-card" />
        ) : (
          <GraphExplorer services={names} initial={{ service: names[0] }} />
        )}
      </div>

      <div className="mt-3.5 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-3.5 max-[1180px]:grid-cols-1">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="label border-b border-line px-[18px] py-4">schema</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse [&_td]:h-10 [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_td]:text-[12.5px] [&_td]:text-mut [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:pb-[9px] [&_th]:pt-3 [&_th]:text-left [&_th]:text-[10.5px] [&_th]:font-medium [&_th]:uppercase [&_th]:leading-none [&_th]:tracking-[0.09em] [&_th]:text-dim [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[180ms] [&_tbody_tr:hover]:bg-hover">
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
                    <td className="font-mono text-[12px] text-fg">{a}</td>
                    <td className="font-mono text-[11.5px] text-signal-2">{r}</td>
                    <td className="font-mono text-[12px] text-fg">{b}</td>
                    <td className="text-[11.5px]">{src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-[18px] py-3 font-mono text-[10.5px] leading-[1.6] text-dim">
            ids are 52-bit <code>gid(key)</code> integers; every node carries its human <code>key</code> · timestamps are int epoch seconds · full rules in <code>docs/schema.md</code>
          </p>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-baseline justify-between gap-4 border-b border-line px-[18px] py-4">
            <span className="label">ingest jobs</span>
            {list && list.length > 0 && <span className="num text-[10.5px] leading-none text-dim">{list.length}</span>}
          </div>
          {!list ? (
            <Unavailable what="jobs" className="m-[18px]" />
          ) : list.length === 0 ? (
            <Empty icon={FolderPlus} sentence="No jobs yet — add a repository to start the first ingest." action="add a repository" className="min-h-[220px]" />
          ) : (
            <ol className="flex max-h-[520px] flex-col overflow-y-auto px-[18px] max-[900px]:max-h-[360px]">
              {list.map((j) => (
                <li key={j.job_id} className="border-b border-line py-2.5 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span className={cn("size-1.5 shrink-0 rounded-full", DOT[j.status] ?? "bg-unknown", j.status === "running" && "blip")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-none text-mut">{j.repo}</span>
                    <span className={cn("shrink-0 whitespace-nowrap font-mono text-[10.5px] leading-none", STATUS[j.status] ?? "text-dim")}>{j.status}</span>
                    <span className="num shrink-0 whitespace-nowrap text-[10.5px] leading-none text-dim">{when(j.started_at)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-[18px] font-mono text-[10.5px] leading-[1.6] text-dim">
                    <span className="num">
                      → {when(j.ended_at)} · {j.job_id}
                    </span>
                    {j.step && j.status === "running" && <span>at {j.step}</span>}
                    {(j.steps ?? []).map((s) => (
                      <span key={s.name} className="inline-flex items-baseline gap-1.5" title={s.detail ?? undefined}>
                        <span className={cn("size-1.5 self-center rounded-full", DOT[s.status] ?? "bg-unknown")} aria-hidden />
                        {s.name}
                        <span className="num whitespace-nowrap">{s.ms == null ? "—" : fmtMs(s.ms)}</span>
                        {s.detail && <span>· {s.detail}</span>}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

// Designed degraded state: dashed --input edge, centred stack, nothing estimated.
function Unavailable({ what, className }: { what: string; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed border-input px-[18px] py-7 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full border border-border text-dim" aria-hidden>
        <PlugZap className="size-[17px]" />
      </span>
      <p className="max-w-[44ch] text-pretty text-[13px] text-mut">Live API unavailable — {what} not shown.</p>
      <p className="font-mono text-[11px] leading-[1.6] text-dim">start it with make up · nothing here is served from cache</p>
    </div>
  );
}

// Designed empty state: 44px muted circle, one sentence, one outlined orange action (→ Services).
function Empty({ icon: Icon, sentence, action, className }: { icon: typeof PlugZap; sentence: string; action: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-[18px] py-8 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full border border-border text-dim" aria-hidden>
        <Icon className="size-[17px]" />
      </span>
      <p className="max-w-[44ch] text-pretty text-[13px] text-mut">{sentence}</p>
      <Link
        href="/services"
        className={ACTION}
      >
        {action}
      </Link>
    </div>
  );
}
