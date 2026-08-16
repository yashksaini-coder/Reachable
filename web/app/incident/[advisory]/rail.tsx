"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// The six questions are the product; this makes them navigable. Sections carry ids q1…q6;
// the rail highlights whichever is highest on screen inside the reading band.
export const QUESTIONS: [string, string][] = [
  ["q1", "exposed"],
  ["q2", "introduced"],
  ["q3", "while live"],
  ["q4", "maintainers"],
  ["q5", "typosquats"],
  ["q6", "blast radius"],
];

// `counts`: the answer summary number per question (q1 → 2 …), shown tiny beside the label.
export function Rail({ counts = {} }: { counts?: Record<string, number | string | null> }) {
  const [active, setActive] = useState("q1");
  useEffect(() => {
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
        const first = QUESTIONS.find(([id]) => seen.has(id));
        if (first) setActive(first[0]);
      },
      { rootMargin: "-15% 0px -55% 0px" },
    );
    for (const [id] of QUESTIONS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return (
    <nav aria-label="Questions" className="sticky top-6">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">questions</div>
      <ol>
        {QUESTIONS.map(([id, label], i) => {
          const on = id === active;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 border-l-2 pl-3 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50",
                  on ? "border-signal text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("num w-5 shrink-0", on ? "text-signal" : "")}>Q{i + 1}</span>
                <span>{label}</span>
                {counts[id] != null && <span className="num ml-auto pr-1 text-[10px] text-muted-foreground/80">{counts[id]}</span>}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
