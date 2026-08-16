import { fmtMs } from "@/lib/incident";

// "How HydraDB answered this" — generated from the statements that were actually executed,
// never a static string. If this card lies, the JSON lies, and the golden test catches it.
export function HydraCard({
  title,
  cypher,
  ms,
  rows,
  truncated,
  timing,
}: {
  title: string;
  cypher: string[];
  ms: number;
  rows: number;
  truncated?: boolean;
  timing?: { cold_ms: number | null; warm_p50_ms: number | null; warm_p95_ms: number | null; runs: number };
}) {
  return (
    <details className="group mt-3 rounded border border-zinc-800 bg-zinc-950/60 text-xs">
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 text-zinc-400 hover:text-zinc-200">
        <span className="font-mono text-[10px] uppercase tracking-widest text-orange-400">HydraDB</span>
        <span>How HydraDB answered “{title}”</span>
        <span className="ml-auto font-mono tabular-nums text-zinc-500">
          {rows} rows · {fmtMs(ms)}
          {timing && timing.runs > 1 && timing.cold_ms != null && (
            <>
              {" "}
              · cold {fmtMs(timing.cold_ms)} / warm p50 {fmtMs(timing.warm_p50_ms)} p95 {fmtMs(timing.warm_p95_ms)} ({timing.runs} runs)
            </>
          )}
          {truncated && <span className="ml-2 text-amber-400">TRUNCATED</span>}
        </span>
      </summary>
      <div className="space-y-2 border-t border-zinc-800 px-3 py-2">
        {cypher.length === 0 && <div className="text-zinc-500">No statement executed.</div>}
        {dedupe(cypher).map(([q, n], i) => (
          <pre key={i} className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-300">
            {n > 1 && <span className="mr-2 rounded bg-zinc-800 px-1 text-zinc-400">×{n}</span>}
            {q}
          </pre>
        ))}
        <p className="text-[10px] text-zinc-500">
          Statements as sent over Bolt. Integer literals are 52-bit ids from <code>gid(key)</code>; string literals in
          <code> algo.MSpaths</code> passed the npm-name allowlist. Timings are wall-clock from the Python driver over loopback.
        </p>
      </div>
    </details>
  );
}

function dedupe(qs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const q of qs) m.set(q, (m.get(q) ?? 0) + 1);
  return [...m.entries()];
}

export function Limits({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 space-y-1 rounded border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/80">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-amber-500">⚠</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

const LEVEL: Record<string, { label: string; cls: string; hint: string }> = {
  L2: { label: "L2 · act now", cls: "bg-red-500/15 text-red-300 border-red-500/40", hint: "vulnerable symbol referenced in first-party code" },
  L1: { label: "L1 · imported", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", hint: "package imported, vulnerable symbol not referenced" },
  L0: { label: "L0 · present only", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", hint: "in the install tree, never imported by scanned files" },
  unscanned: { label: "unscanned", cls: "bg-zinc-700/40 text-zinc-300 border-zinc-600", hint: "no source files ingested — reachability unknown, never assumed safe" },
};

export function Level({ level }: { level: string }) {
  const l = LEVEL[level] ?? LEVEL.unscanned;
  return (
    <span title={l.hint} className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${l.cls}`}>
      {l.label}
    </span>
  );
}

export function Kind({ kind }: { kind: string }) {
  const cls =
    kind === "exact"
      ? "text-emerald-300 border-emerald-500/40"
      : kind === "upper_bound"
        ? "text-amber-300 border-amber-500/40"
        : "text-sky-300 border-sky-500/40";
  return <span className={`rounded border px-1 font-mono text-[10px] ${cls}`}>{kind.replace("_", " ")}</span>;
}

export function Stat({ n, label, tone = "" }: { n: number | string | null; label: string; tone?: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className={`font-mono text-3xl tabular-nums ${tone}`}>{n ?? "n/a"}</div>
      <div className="mt-1 text-xs text-zinc-400">{label}</div>
    </div>
  );
}
