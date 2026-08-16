"use client";

// Client half of the home page: the count-up metrics and the staggered incident rows.
// Data arrives from the server component in page.tsx; nothing here fetches.

import Link from "next/link";
import { type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CountUp } from "@/app/incident/count-up";
import { ChevronRight } from "lucide-react";
import { fmtMs, fmtUtc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

export function Metric({ n, label, tone = "" }: { n: number; label: string; tone?: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className={cn("num text-3xl leading-none", tone)}>
        <CountUp n={n} />
      </dd>
      <dd className="mt-1 text-[11px] text-muted-foreground" aria-hidden>
        {label}
      </dd>
    </div>
  );
}

export type IncidentRow = {
  key: string;
  kind: string;
  severity: string;
  summary: string;
  published_at_iso: string;
  exposed: number;
  live: number | null;
  l2: number;
  unscanned: number;
  cold_ms: number | null;
  warm_ms: number | null;
};

const COLS = "grid grid-cols-[minmax(260px,1fr)_repeat(4,72px)_150px_130px_20px] items-center gap-x-4";

export function IncidentRows({ rows }: { rows: IncidentRow[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="overflow-x-auto rounded-xl border border-border elev">
      <div className="min-w-[860px] divide-y divide-border">
        <div className={cn(COLS, "bg-card/60 px-4 py-2 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground")}>
          <span>advisory</span>
          <span className="text-right">exposed</span>
          <span className="text-right">while live</span>
          <span className="text-right">act now</span>
          <span className="text-right">unscanned</span>
          <span>published</span>
          <span className="text-right">cold · warm</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <motion.div
            key={r.key}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: i * 0.06 }}
          >
            <Link
              href={`/incident/${r.key}`}
              className={cn(
                COLS,
                "group px-4 py-3 text-[13px] transition-[background-color,transform] duration-150 hover:bg-card active:scale-[0.99] focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] text-signal-2">{r.key}</span>
                  <Badge variant="outline" className="rounded-full font-mono text-[10px] uppercase">
                    {r.kind}
                  </Badge>
                  <Badge variant="outline" className={cn("rounded-full font-mono text-[10px] uppercase", sevTone(r.severity))}>
                    {r.severity}
                  </Badge>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{r.summary}</div>
              </div>
              <Num n={r.exposed} />
              <Num n={r.live ?? "n/a"} tone="text-l1" />
              <Num n={r.l2} tone="text-l2" />
              <Num n={r.unscanned} tone="text-unknown" />
              <span className="num text-[11.5px] text-muted-foreground">{fmtUtc(r.published_at_iso)}</span>
              <span className="num text-right text-[11.5px] text-muted-foreground">
                {fmtMs(r.cold_ms)} · {fmtMs(r.warm_ms)}
              </span>
              <ChevronRight
                className="size-4 text-muted-foreground transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-signal"
                strokeWidth={1.75}
              />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Severity chips reuse the verdict scale: critical/high read as L2, moderate as L1, the rest neutral.
function sevTone(sev: string) {
  const s = sev.toLowerCase();
  return s === "critical" || s === "high" ? "border-l2/40 text-l2" : s === "moderate" || s === "medium" ? "border-l1/40 text-l1" : "";
}

function Num({ n, tone = "" }: { n: number | string; tone?: string }): ReactNode {
  return <span className={cn("num text-right text-[15px]", n === 0 || n === "n/a" ? "text-muted-foreground" : tone)}>{n}</span>;
}
