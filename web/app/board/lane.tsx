"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { Chip, Level } from "@/app/ui";
import { cn } from "@/lib/utils";

export type Card = {
  href: string;
  slug: string;
  advisory: string;
  level: string;
  whileLive: boolean;
  meta: string;
};

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

// One board column. Section header (title · hint · counted badge), cards enter with a
// per-column stagger, count-up on the badge; the empty state is a dashed lane with one hint.
export function Lane({ title, hint, tone, index, cards }: { title: string; hint: string; tone: string; index: number; cards: Card[] }) {
  const reduce = useReducedMotion();
  const base = index * 0.06;
  return (
    <section className={cn("elev rounded-xl border border-border border-t-2 bg-card p-2", tone)}>
      <header className="flex items-start justify-between gap-2 px-1.5 pt-1 pb-2.5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground/80 text-pretty">{hint}</div>
        </div>
        <span
          className={cn("num shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[13px] leading-none", cards.length ? "text-foreground" : "text-muted-foreground")}
          aria-label={`${cards.length} exposures`}
        >
          <CountUp n={cards.length} delay={base} />
        </span>
      </header>
      {cards.length === 0 ? (
        <div className="grid min-h-20 place-items-center rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground/70 text-pretty">
          nothing in this state
        </div>
      ) : (
        <ol className="space-y-2">
          {cards.map((c, i) => (
            <motion.li
              key={`${c.advisory}:${c.slug}`}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: base + Math.min(i, 8) * 0.05 }}
            >
              <Link
                href={c.href}
                className="group block rounded-lg border border-border bg-background/70 px-3 py-2 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-signal/40 hover:elev-2 focus-visible:ring-2 focus-visible:ring-signal/50 focus-visible:outline-none active:scale-[0.96]"
              >
                <div className="truncate font-mono text-[12.5px] transition-colors group-hover:text-signal-2">{c.slug}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Level level={c.level} />
                  {c.whileLive && <Chip tone="border-l1/40 text-l1">while live</Chip>}
                  <Chip>{c.advisory}</Chip>
                </div>
                <div className="num mt-1.5 truncate text-[10.5px] text-muted-foreground" title={c.meta}>
                  {c.meta}
                </div>
              </Link>
            </motion.li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CountUp({ n, delay }: { n: number; delay: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const ctrl = animate(0, n, { duration: 0.5, delay, ease: "easeOut", onUpdate: (x) => setV(Math.round(x)) });
    return () => ctrl.stop();
  }, [n, delay, reduce]);
  return <>{reduce ? n : v}</>;
}
