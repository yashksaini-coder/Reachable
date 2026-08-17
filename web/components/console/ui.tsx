"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LEVEL } from "@/lib/level";
import { CountUp } from "@/components/console/count-up";

// Elevation utility (shadow + tint, never a thicker border) — see globals.css `.elev`.
export const ELEV = "elev";


// HydraCard — the engine-identity strip. Generated from the statements that were actually
// executed, never a static string; if this card lies, the JSON lies, and the golden test catches it.
// Spec: 1px --border + 2px orange left rule, 8px radius, --card2. Header ≥44px: mono `hydradb`
// tag · the question (ellipsed; wraps to its own line <760px) · `{rows} rows · {ms} · {temp}` ·
// chevron (180° on open). Body: the Cypher in a --code <pre>, 11.5/1.65 mono, --signal-2, plus a
// "copy statement" button that reads "copied". Collapsed is fine; hidden is never allowed.
const EASE = [0.32, 0.72, 0, 1] as const;

// Print mode — on while a report is being exported (Export PDF button, or `?print=1`). Every
// HydraCard and ShowAll opens without animation so the printed page carries the whole report.
// Outside a provider it reads false, so the primitives behave normally on every other page.
const PrintCtx = createContext<{ on: boolean; set: (v: boolean) => void }>({ on: false, set: () => {} });
export function PrintProvider({ children }: { children: ReactNode }) {
  const [on, set] = useState(false);
  return <PrintCtx.Provider value={{ on, set }}>{children}</PrintCtx.Provider>;
}
export const usePrintMode = () => useContext(PrintCtx);

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
  const print = usePrintMode().on;
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : { duration: 0.25, ease: EASE };
  const statements = dedupe(cypher);
  // Temperature is stated only when it was measured (a cold/warm pair); a lone ms carries no claim.
  const warm = timing && timing.runs > 1 && timing.warm_p50_ms != null;
  const body = (
    <div className="px-[13px] pb-[13px]">
      {statements.length === 0 ? (
        <div className="rounded-md border border-line bg-code p-3 font-mono text-[12.5px] text-dim">no statement executed</div>
      ) : (
        <pre className="m-0 overflow-x-auto rounded-md border border-line bg-code p-3 font-mono text-[12.5px] leading-[1.65] text-signal-2">
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
        <span className="font-mono text-[11.5px] leading-[1.6] text-dim">
          as sent over Bolt · integer literals are 52-bit ids · timings are wall-clock from the driver over loopback
        </span>
      </div>
    </div>
  );
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border border-l-2 border-l-signal/55 bg-card2", !flat && "mt-3")}>
      <button
        type="button"
        aria-expanded={open || print}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3.5 px-[13px] py-[11px] text-left transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50 max-[760px]:flex-wrap"
      >
        <span className="shrink-0 rounded-xs bg-sigfill px-1.5 py-[5px] font-mono text-[11.5px] font-medium uppercase leading-none tracking-[0.1em] text-signal">hydradb</span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-mut max-[760px]:order-2 max-[760px]:basis-full max-[760px]:whitespace-normal">{title}</span>
        <span className="num shrink-0 text-[11.5px] leading-none text-dim">
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
        <motion.span animate={{ rotate: open || print ? 180 : 0 }} transition={t} className="inline-flex shrink-0 text-dim print:hidden" aria-hidden>
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>
      {print ? (
        body
      ) : (
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
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      )}
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
      className="grid min-h-10 shrink-0 rounded-md border border-border px-[11px] text-[12px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97] print:hidden [&>*]:[grid-area:1/1]"
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

// Notes / Limits — 11px/1.6 mono --dim, prefixed `notes ·` or `limits ·`. Never boxed. Limits are
// stated caveats of the answer (caps, bounds, what is not proven) and read the same quiet way:
// the words carry the weight, not a coloured box.
export function Notes({ items, prefix = "notes" }: { items: string[]; prefix?: "notes" | "limits" }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="mt-3.5 space-y-1 font-mono text-[12px] leading-[1.6] text-dim">
      {list.map((t, i) => (
        <p key={i} className="text-pretty">
          {i === 0 && <span className="mr-1">{prefix} ·</span>}
          {t}
        </p>
      ))}
    </div>
  );
}
export function Limits({ items }: { items: string[]; tone?: "warning" | "quiet" }) {
  return <Notes items={items} prefix="limits" />;
}

// Question card — --card, 1px --border, 14px radius, --elev. Header: mono `Qn` tag in --signal,
// title 17px/500, right-aligned summary in 11px mono --dim (two lines allowed), 1px --line beneath.
// Body 18px padding. Same anatomy for all six so the rhythm reads; `id` = q1…q6 for the rail.
export function Question({
  n,
  title,
  summary,
  children,
  footer,
  className,
}: {
  n: string;
  title: string;
  summary?: ReactNode;
  star?: boolean; // accepted for callers; no longer rendered
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section id={`q${n}`} data-sect={`q${n}`} className={cn("scroll-mt-24 rounded-2xl border border-border bg-card elev", className)}>
      <header className="q-head flex items-start gap-x-[18px] gap-y-2 border-b border-line px-[18px] pb-[14px] pt-[18px] max-[760px]:flex-wrap print:px-0 print:pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="font-mono text-[12px] font-medium leading-none text-signal">{`Q${n}`}</span>
            <h2 className="text-balance text-[18px] font-medium leading-[1.3] tracking-[-0.01em] text-fg">{title}</h2>
          </div>
        </div>
        {summary && <div className="num max-w-[46%] shrink-0 text-right text-[12px] leading-[1.5] text-dim max-[760px]:w-full max-[760px]:max-w-none max-[760px]:text-left">{summary}</div>}
      </header>
      <div className="p-[18px] print:px-0">{children}</div>
      {footer && <footer className="border-t border-line">{footer}</footer>}
    </section>
  );
}

// Table rows past a cap, behind a "show all N" row. `children` render always; `more` on demand.
export function ShowAll({ n, cols, children, more }: { n: number; cols: number; children: ReactNode; more: ReactNode }) {
  const [open, setOpen] = useState(false);
  const print = usePrintMode().on;
  return (
    <>
      {children}
      {open || print ? (
        more
      ) : (
        <tr>
          <td colSpan={cols} className="p-0">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex min-h-10 w-full cursor-pointer items-center justify-center gap-1 text-[12px] text-dim transition-colors duration-[180ms] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50"
            >
              <ChevronDown className="size-3.5" /> show all <span className="num">{n}</span>
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

export { LEVEL } from "@/lib/level";

// Pill geometry (shared): 10.5px/500 uppercase, tracking .07em, padding 5px 7px, 5px radius.
const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-[7px] py-[5px] text-[11.5px] font-medium uppercase leading-none tracking-[0.07em]";

// Level pill — verdict colour on its /14 tint.
export function Level({ level, className }: { level: string; className?: string }) {
  const l = LEVEL[level] ?? LEVEL.unscanned;
  return (
    <span title={l.hint} className={cn(PILL, l.text, l.bg, className)}>
      <span className={cn("size-1.5 rounded-full", l.dot)} aria-hidden />
      {l.label}
    </span>
  );
}

// Kind pill — same geometry, --mut on --hover. `upper_bound` keeps its words verbatim (rule 3);
// it reads amber-outlined so the bound is never mistaken for an exact edge.
export function Kind({ kind, className }: { kind: string; className?: string }) {
  const k = kind.replace(/_/g, " ");
  if (kind === "upper_bound")
    return <span className={cn(PILL, "border border-l1/35 font-mono normal-case tracking-normal text-l1", className)}>{k}</span>;
  return <span className={cn(PILL, "bg-hover text-mut", className)}>{k}</span>;
}

// Chip — the generic pill for metadata (kinds, cohorts, distances). `tone` may add semantic text
// colour; the surface stays --hover.
export function Chip({ children, tone = "", className }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cn(PILL, "bg-hover font-mono normal-case tracking-normal text-[11.5px] text-mut", tone, className)}>{children}</span>;
}

// Stat — big mono numeral (30–40px/500, −.03em; 32px at ≤600px), lowercase 10.5px --dim label, and a 2px × 22px rule
// carrying the semantic colour. Lives inside <StatStrip/>, whose cells draw their own hairlines.
// `n` is server-rendered as its true value and counted down-then-up on the client (rule 9).
export function Stat({
  n,
  label,
  rule = "bg-border",
  tone = "text-fg",
  size = "md",
  delay = 0,
  className,
}: {
  n: number | string | null;
  label: string;
  rule?: string; // a bg-* class carrying the semantic colour (bg-signal · bg-l2 · bg-l1 · bg-l0 · bg-unknown · bg-signal-2)
  tone?: string; // numeral colour class; verdict stats colour the numeral too
  size?: "md" | "lg";
  delay?: number;
  className?: string;
}) {
  return (
    <div className={cn("bg-card px-4 pb-[18px] pt-4 cell-lines", className)}>
      <span aria-hidden className={cn("mb-3.5 block h-0.5 w-[22px]", rule)} />
      <div className={cn("num font-medium leading-none tracking-[-0.03em]", size === "lg" ? "text-[40px] max-[600px]:text-[32px]" : "text-[32px]", tone)}>
        {typeof n === "number" ? <CountUp n={n} delay={delay} /> : n == null ? <span className="text-dim">—</span> : n}
      </div>
      <div className="mt-[7px] text-[11.5px] lowercase text-dim">{label}</div>
    </div>
  );
}

// StatStrip — auto-fit minmax(158px,1fr) grid, 1px --border container, 12px radius, --elev; cells
// draw hairlines per cell (see .cell-lines) so a wrapped row leaves no phantom cells.
export function StatStrip({ children, min = 158, className }: { children: ReactNode; min?: number; className?: string }) {
  return (
    <div className={cn("grid overflow-hidden rounded-xl border border-border bg-card elev print:rounded-none print:shadow-none", className)} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  );
}

// Section label — 10.5px uppercase tracked --dim, optionally with a right-hand mono note.
export function SectionLabel({ children, note, className }: { children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <span className="label">{children}</span>
      {note && <span className="font-mono text-[11.5px] text-dim">{note}</span>}
    </div>
  );
}
