"use client";

import { useEffect, useState } from "react";

// Truthful odometer (handoff rule 9): the server renders the TRUE value; only after an effect has
// decided motion may run does the number drop to 0 and climb back — 760ms cubic ease-out, `delay`
// staggers siblings (90ms per stat). No JS / reduced motion → the real number is what shows.
export function CountUp({ n, delay = 0, className, format }: { n: number; delay?: number; className?: string; format?: (v: number) => string }) {
  const [v, setV] = useState(n);
  const fmt = format ?? ((x: number) => Math.round(x).toLocaleString());
  useEffect(() => {
    if (n === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(n);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = () => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / 760));
      setV(n * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, delay]);
  return <span className={className}>{fmt(v)}</span>;
}
