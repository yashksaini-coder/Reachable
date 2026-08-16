"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Right rail — a mini-map of the report: blast radius + Q1–Q6. Each entry carries a 2px left
// border (--signal when active), a dot in that section's verdict colour, the label and its count.
// The active section comes from a scroll listener on #console-main (the scroll container is
// <main>, never window): the last section whose top is above 220px wins. Clicking sets
// main.scrollTop with a 96px offset — no scrollIntoView, no hash jumps.
export type RailEntry = { id: string; label: string; n: number | string; dot: string };

const OFFSET = 96;

export function Rail({ entries }: { entries: RailEntry[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? "graph");
  useEffect(() => {
    const main = document.getElementById("console-main");
    if (!main) return;
    const onScroll = () => {
      let act: string | null = null;
      for (const s of document.querySelectorAll<HTMLElement>("[data-sect]")) if (s.getBoundingClientRect().top < 220) act = s.dataset.sect ?? null;
      if (act) setActive(act);
    };
    onScroll();
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);
  const go = (id: string) => {
    const main = document.getElementById("console-main");
    const el = document.querySelector<HTMLElement>(`[data-sect="${id}"]`);
    if (!main || !el) return;
    main.scrollTop += el.getBoundingClientRect().top - OFFSET;
  };
  return (
    <nav aria-label="this report" className="sticky top-9 flex flex-col gap-0.5 print:hidden">
      <div className="label pb-3 pl-3 tracking-[0.11em]">this report</div>
      {entries.map((e) => {
        const on = e.id === active;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => go(e.id)}
            aria-current={on ? "location" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50",
              on ? "border-signal" : "border-transparent",
            )}
          >
            <span className={cn("size-[5px] shrink-0 rounded-full", e.dot)} aria-hidden />
            <span className={cn("min-w-0 flex-1 truncate text-[11.5px] leading-[1.3]", on ? "text-fg" : "text-mut")}>{e.label}</span>
            <span className="num text-[10.5px] leading-none text-dim">{e.n}</span>
          </button>
        );
      })}
    </nav>
  );
}
