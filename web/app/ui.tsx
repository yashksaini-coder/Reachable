"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/app/incident/count-up";

// Layered elevation for cards (hairline ring + contact shadow + soft ambient). Same value the
// layered shadow utility defined in globals.css
export const ELEV = "elev";

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

// HydraCard — the engine-identity strip. Generated from the statements that were actually
// executed, never a static string; if this card lies, the JSON lies, and the golden test catches it.
// Spec: 1px --border + 2px orange left rule, 8px radius, --card2. Header ≥44px: mono `hydradb`
// tag · the question (ellipsed; wraps to its own line <760px) · `{rows} rows · {ms} · {temp}` ·
// chevron (180° on open). Body: the Cypher in a --code <pre>, 11.5/1.65 mono, --signal-2, plus a
// "copy statement" button that reads "copied". Collapsed is fine; hidden is never allowed.
const EASE = [0.32, 0.72, 0, 1] as const;

export function HydraCard({
  title,
  cypher,
  ms,
  rows,
  truncated,
  timing,
  defaultOpen = false,
  flat = false,
}: {
  title: string;
  cypher: string[];
  ms: number;
  rows: number;
  truncated?: boolean;
  timing?: { cold_ms: number | null; warm_p50_ms: number | null; warm_p95_ms: number | null; runs: number };
  defaultOpen?: boolean;
  flat?: boolean; // no outer margin (caller stacks cards itself)
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : { duration: 0.25, ease: EASE };
  const statements = dedupe(cypher);
  // Temperature is stated only when it was measured (a cold/warm pair); a lone ms carries no claim.
  const warm = timing && timing.runs > 1 && timing.warm_p50_ms != null;
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border border-l-2 border-l-signal/55 bg-card2", !flat && "mt-3")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3.5 px-[13px] py-[11px] text-left transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50 max-[760px]:flex-wrap"
      >
        <span className="shrink-0 rounded-xs bg-sigfill px-1.5 py-[5px] font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.1em] text-signal">hydradb</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-mut max-[760px]:order-2 max-[760px]:basis-full max-[760px]:whitespace-normal">{title}</span>
        <span className="num shrink-0 text-[10.5px] leading-none text-dim">
          {rows} rows · {fmtMs(ms)}
          {warm && (
            <>
              {" "}
              · warm p50 {fmtMs(timing.warm_p50_ms)}
              {timing.cold_ms != null && <> · cold {fmtMs(timing.cold_ms)}</>}
            </>
          )}
          {truncated && <span className="ml-2 text-l1">truncated</span>}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={t} className="inline-flex shrink-0 text-dim" aria-hidden>
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0.55 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0.55, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }}
            transition={t}
            className="overflow-hidden"
          >
            <div className="px-[13px] pb-[13px]">
              {statements.length === 0 ? (
                <div className="rounded-md border border-line bg-code p-3 font-mono text-[11.5px] text-dim">no statement executed</div>
              ) : (
                <pre className="m-0 overflow-x-auto rounded-md border border-line bg-code p-3 font-mono text-[11.5px] leading-[1.65] text-signal-2">
                  {statements.map(([q, n], i) => (
                    <span key={i} className="block">
                      {i > 0 && "\n"}
                      {n > 1 && <span className="mr-2 rounded-xs bg-hover px-1 text-dim">×{n}</span>}
                      {q}
                    </span>
                  ))}
                </pre>
              )}
              <div className="mt-[9px] flex items-center gap-2">
                {statements.length > 0 && <CopyStatement text={statements.map(([q]) => q).join("\n\n")} />}
                <span className="font-mono text-[10.5px] leading-[1.6] text-dim">
                  as sent over Bolt · integer literals are 52-bit ids · timings are wall-clock from the driver over loopback
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// "copy statement" → "copied": the label swaps with the opacity/scale/blur pop, no icon toggling.
function CopyStatement({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : { duration: 0.25, ease: EASE };
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="grid min-h-8 shrink-0 rounded-md border border-border px-[11px] text-[11px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97] [&>*]:[grid-area:1/1]"
    >
      <motion.span initial={false} animate={done ? { opacity: 0, scale: 0.25, filter: "blur(4px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }} transition={t} className="inline-flex items-center">
        copy statement
      </motion.span>
      <motion.span initial={false} animate={done ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }} transition={t} className="inline-flex items-center justify-center text-l0" aria-live="polite">
        copied
      </motion.span>
    </button>
  );
}

function dedupe(qs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const q of qs) m.set(q, (m.get(q) ?? 0) + 1);
  return [...m.entries()];
}

// Amber is reserved for real warnings (truncation, explicit warnings). tone="quiet" is Notes.
export function Limits({ items, tone = "warning" }: { items: string[]; tone?: "warning" | "quiet" }) {
  if (!items.length) return null;
  if (tone === "quiet") return <Notes items={items} />;
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

// Method notes: what the answer does and does not prove. Informational, not an alarm.
export function Notes({ items }: { items: string[] }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="space-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
      {list.map((t, i) => (
        <li key={i} className="flex gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" />
          <span className="text-pretty">{t}</span>
        </li>
      ))}
    </ul>
  );
}

// One question = one section card: header (Qn · title · answer summary), body (the answer's own
// visual), footer strip (HydraDB disclosure + notes). Same anatomy for all six so the rhythm reads.
export function Question({
  n,
  title,
  summary,
  star,
  children,
  footer,
}: {
  n: string;
  title: string;
  summary?: ReactNode;
  star?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section id={`q${n}`} className={cn("scroll-mt-6 overflow-hidden rounded-lg border border-border bg-card", ELEV)}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] tracking-widest text-signal">{`Q${n}`}</span>
        <h2 className="text-balance text-[17px] font-medium tracking-tight">{title}</h2>
        {star && <span className="text-[11px] text-muted-foreground">★ differentiator</span>}
        {summary && <span className="num basis-full text-[11px] text-muted-foreground md:ml-auto md:basis-auto md:text-right">{summary}</span>}
      </header>
      <div className="p-4">{children}</div>
      {footer && <footer className="bg-background/40 text-xs">{footer}</footer>}
    </section>
  );
}

// Table rows past a cap, behind a "show all N" row. `children` render always; `more` on demand.
export function ShowAll({ n, cols, children, more }: { n: number; cols: number; children: ReactNode; more: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {children}
      {open ? (
        more
      ) : (
        <tr>
          <td colSpan={cols} className="p-0">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex min-h-10 w-full cursor-pointer items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50"
            >
              <ChevronRight className="size-3.5 rotate-90" /> show all <span className="num">{n}</span>
            </button>
          </td>
        </tr>
      )}
    </>
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

// `rule` = a bg-* class; draws the verdict colour as a thin top rule so the tile reads by colour, not only by numeral.
export function Stat({ n, label, tone = "", rule }: { n: number | string | null; label: string; tone?: string; rule?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3", ELEV)}>
      {rule && <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", rule)} />}
      <div className={cn("num text-3xl leading-none", tone)}>{typeof n === "number" ? <CountUp n={n} /> : (n ?? "n/a")}</div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function Chip({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10.5px] text-muted-foreground", tone)}>
      {children}
    </Badge>
  );
}
