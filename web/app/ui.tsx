import type { ReactNode } from "react";
import { AlertTriangle, ChevronRight, Database } from "lucide-react";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// "How HydraDB answered this" — generated from the statements that were actually executed,
// never a static string. If this card lies, the JSON lies, and the golden test catches it.
export function HydraCard({
  title,
  cypher,
  ms,
  rows,
  truncated,
  timing,
  defaultOpen = false,
}: {
  title: string;
  cypher: string[];
  ms: number;
  rows: number;
  truncated?: boolean;
  timing?: { cold_ms: number | null; warm_p50_ms: number | null; warm_p95_ms: number | null; runs: number };
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group mt-3 overflow-hidden rounded-lg border border-border bg-card/70">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" strokeWidth={2} />
        <Database className="size-3.5 shrink-0 text-signal" strokeWidth={1.75} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">HydraDB</span>
        <span className="min-w-0 flex-1 basis-40">How HydraDB answered “{title}”</span>
        <span className="num basis-full text-[11px] text-muted-foreground md:ml-auto md:basis-auto md:text-right">
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
      <div className="space-y-2 border-t border-border bg-background/60 px-3 py-2">
        {cypher.length === 0 && <div className="text-xs text-muted-foreground">No statement executed.</div>}
        {dedupe(cypher).map(([q, n], i) => (
          <pre key={i} className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/90">
            {n > 1 && <span className="mr-2 rounded bg-secondary px-1 text-muted-foreground">×{n}</span>}
            {q}
          </pre>
        ))}
        <p className="text-[10px] text-muted-foreground">
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
    <ul className="mt-3 space-y-1 rounded-lg border border-l1/25 bg-l1/5 px-3 py-2 text-xs text-l1/90">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

const LEVEL: Record<string, { label: string; cls: string; dot: string; hint: string }> = {
  L2: { label: "L2 · act now", cls: "border-l2/40 bg-l2/10 text-l2", dot: "bg-l2", hint: "vulnerable symbol referenced in first-party code" },
  L1: { label: "L1 · imported", cls: "border-l1/40 bg-l1/10 text-l1", dot: "bg-l1", hint: "package imported by first-party code; symbol not referenced" },
  L0: { label: "L0 · present only", cls: "border-l0/40 bg-l0/10 text-l0", dot: "bg-l0", hint: "in the install tree; never imported by scanned files" },
  unscanned: { label: "unscanned", cls: "border-unknown/40 bg-unknown/10 text-unknown", dot: "bg-unknown", hint: "no source files ingested — reachability unknown, never assumed safe" },
};

export function Level({ level, className }: { level: string; className?: string }) {
  const l = LEVEL[level] ?? LEVEL.unscanned;
  return (
    <Badge variant="outline" title={l.hint} className={cn("gap-1.5 rounded-full font-mono text-[10.5px] uppercase tracking-wide", l.cls, className)}>
      <span className={cn("size-1.5 rounded-full", l.dot)} aria-hidden />
      {l.label}
    </Badge>
  );
}

export function Kind({ kind }: { kind: string }) {
  const cls =
    kind === "exact" ? "border-l0/40 text-l0" : kind === "upper_bound" ? "border-l1/40 text-l1" : "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {kind.replace("_", " ")}
    </Badge>
  );
}

export function Stat({ n, label, tone = "" }: { n: number | string | null; label: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className={cn("num text-3xl leading-none", tone)}>{n ?? "n/a"}</div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function SectionTitle({ n, title, star }: { n: string; title: string; star?: boolean }) {
  return (
    <h2 className="mb-3 flex flex-wrap items-baseline gap-3">
      <span className="font-mono text-[11px] tracking-widest text-signal">{`Q${n}`}</span>
      <span className="text-[17px] font-medium tracking-tight">{title}</span>
      {star && <span className="text-[11px] text-muted-foreground">★ differentiator</span>}
    </h2>
  );
}

export function Chip({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10.5px] text-muted-foreground", tone)}>
      {children}
    </Badge>
  );
}
