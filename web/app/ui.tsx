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
    <details className="group mt-3 rounded border border-line bg-panel text-xs">
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 text-ink-2 hover:text-ink">
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">HydraDB</span>
        <span>How HydraDB answered “{title}”</span>
        <span className="ml-auto font-mono tabular-nums text-ink-3">
          {rows} rows · {fmtMs(ms)}
          {timing && timing.runs > 1 && timing.cold_ms != null && (
            <>
              {" "}
              · cold {fmtMs(timing.cold_ms)} / warm p50 {fmtMs(timing.warm_p50_ms)} p95 {fmtMs(timing.warm_p95_ms)} ({timing.runs} runs)
            </>
          )}
          {truncated && <span className="ml-2 text-l1">TRUNCATED</span>}
        </span>
      </summary>
      <div className="space-y-2 border-t border-line px-3 py-2">
        {cypher.length === 0 && <div className="text-ink-3">No statement executed.</div>}
        {dedupe(cypher).map(([q, n], i) => (
          <pre key={i} className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
            {n > 1 && <span className="mr-2 rounded bg-panel-2 px-1 text-ink-2">×{n}</span>}
            {q}
          </pre>
        ))}
        <p className="text-[10px] text-ink-3">
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
    <ul className="mt-3 space-y-1 rounded border border-l1/30 bg-l1/5 px-3 py-2 text-xs text-l1/80">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-l1">⚠</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

const LEVEL: Record<string, { label: string; cls: string; hint: string }> = {
  L2: { label: "L2 · act now", cls: "bg-l2/15 text-l2 border-red-500/40", hint: "vulnerable symbol referenced in first-party code" },
  L1: { label: "L1 · imported", cls: "bg-l1/15 text-l1 border-l1/40", hint: "package imported, vulnerable symbol not referenced" },
  L0: { label: "L0 · present only", cls: "bg-emerald-500/15 text-l0 border-l0/40", hint: "in the install tree, never imported by scanned files" },
  unscanned: { label: "unscanned", cls: "bg-panel-2 text-ink-2 border-line-2", hint: "no source files ingested — reachability unknown, never assumed safe" },
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
      ? "text-l0 border-l0/40"
      : kind === "upper_bound"
        ? "text-l1 border-l1/40"
        : "text-ink-2 border-line-2"; // unbounded: still on the registry
  return <span className={`rounded border px-1 font-mono text-[10px] ${cls}`}>{kind.replace("_", " ")}</span>;
}

export function Stat({ n, label, tone = "" }: { n: number | string | null; label: string; tone?: string }) {
  return (
    <div className="rounded border border-line bg-panel px-4 py-3">
      <div className={`font-mono text-3xl tabular-nums ${tone}`}>{n ?? "n/a"}</div>
      <div className="mt-1 text-xs text-ink-2">{label}</div>
    </div>
  );
}
