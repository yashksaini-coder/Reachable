"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, ChevronRight, Copy, Database } from "lucide-react";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/app/incident/count-up";

// Layered elevation for cards (hairline ring + contact shadow + soft ambient). Same value the
// layered shadow utility defined in globals.css
export const ELEV = "elev";

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

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
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : SPRING;
  return (
    <div className={cn("mt-3 overflow-hidden rounded-lg border border-border bg-card/70", ELEV)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={t} className="inline-flex shrink-0">
          <ChevronRight className="size-3.5" strokeWidth={2} />
        </motion.span>
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
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: reduce ? 0 : 0.2 } }}
            transition={t}
            className="overflow-hidden"
          >
            <div className="relative space-y-2 border-t border-border bg-background/60 px-3 py-2 pr-12">
              {cypher.length > 0 && <CopyButton text={dedupe(cypher).map(([q]) => q).join("\n\n")} />}
              {cypher.length === 0 && <div className="text-xs text-muted-foreground">No statement executed.</div>}
              {dedupe(cypher).map(([q, n], i) => (
                <pre key={i} className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/90">
                  {n > 1 && <span className="num mr-2 rounded bg-secondary px-1 text-muted-foreground">×{n}</span>}
                  {q}
                </pre>
              ))}
              <p className="text-pretty text-[10px] text-muted-foreground">
                Statements as sent over Bolt. Integer literals are 52-bit ids from <code>gid(key)</code>; string literals in
                <code> algo.MSpaths</code> passed the npm-name allowlist. Timings are wall-clock from the Python driver over loopback.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Copy → Check cross-fade: both icons share one grid cell; opacity/scale/blur swap between them.
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : SPRING;
  const show = { opacity: 1, scale: 1, filter: "blur(0px)" };
  const hide = { opacity: 0, scale: 0.25, filter: "blur(4px)" };
  return (
    <button
      type="button"
      aria-label={done ? "copied" : "copy cypher"}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="absolute right-1 top-1 grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.96] [&>*]:[grid-area:1/1]"
    >
      <motion.span initial={false} animate={done ? hide : show} transition={t} className="inline-flex">
        <Copy className="size-3.5" strokeWidth={1.75} />
      </motion.span>
      <motion.span initial={false} animate={done ? show : hide} transition={t} className="inline-flex">
        <Check className="size-3.5 text-l0" strokeWidth={2} />
      </motion.span>
    </button>
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
          <span className="text-pretty">{t}</span>
        </li>
      ))}
    </ul>
  );
}

const LEVEL: Record<string, { label: string; cls: string; dot: string; hint: string }> = {
  L2: { label: "L2 · act now", cls: "border-l2/40 bg-l2/10 text-l2 inset-shadow-l2/40", dot: "bg-l2", hint: "vulnerable symbol referenced in first-party code" },
  L1: { label: "L1 · imported", cls: "border-l1/40 bg-l1/10 text-l1 inset-shadow-l1/40", dot: "bg-l1", hint: "package imported by first-party code; symbol not referenced" },
  L0: { label: "L0 · present only", cls: "border-l0/40 bg-l0/10 text-l0 inset-shadow-l0/40", dot: "bg-l0", hint: "in the install tree; never imported by scanned files" },
  unscanned: {
    label: "unscanned",
    cls: "border-unknown/40 bg-unknown/10 text-unknown inset-shadow-unknown/40",
    dot: "bg-unknown",
    hint: "no source files ingested — reachability unknown, never assumed safe",
  },
};

export function Level({ level, className }: { level: string; className?: string }) {
  const l = LEVEL[level] ?? LEVEL.unscanned;
  return (
    <Badge
      variant="outline"
      title={l.hint}
      className={cn("gap-1.5 rounded-full font-mono text-[10.5px] uppercase tracking-wide inset-shadow-[0_0_8px_-3px]", l.cls, className)}
    >
      <span className={cn("size-1.5 rounded-full", l.dot)} aria-hidden />
      {l.label}
    </Badge>
  );
}

export function Kind({ kind }: { kind: string }) {
  const cls =
    kind === "exact" ? "border-l0/40 text-l0 inset-shadow-l0/40" : kind === "upper_bound" ? "border-l1/40 text-l1 inset-shadow-l1/40" : "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10.5px] uppercase tracking-wide inset-shadow-[0_0_8px_-3px]", cls)}>
      {kind.replace("_", " ")}
    </Badge>
  );
}

export function Stat({ n, label, tone = "" }: { n: number | string | null; label: string; tone?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-4 py-3", ELEV)}>
      <div className={cn("num text-3xl leading-none", tone)}>{typeof n === "number" ? <CountUp n={n} /> : (n ?? "n/a")}</div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function SectionTitle({ n, title, star }: { n: string; title: string; star?: boolean }) {
  return (
    <h2 className="mb-3 flex flex-wrap items-baseline gap-3">
      <span className="font-mono text-[11px] tracking-widest text-signal">{`Q${n}`}</span>
      <span className="text-balance text-[17px] font-medium tracking-tight">{title}</span>
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
