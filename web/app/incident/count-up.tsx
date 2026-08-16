"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

// Counts 0 → n on mount. Server renders n itself, so there is no layout flash and no
// hydration mismatch; the client only animates after hydration.
export function CountUp({ n, className }: { n: number; className?: string }) {
  const [v, setV] = useState(n);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || n === 0) return;
    const c = animate(0, n, { duration: 0.6, ease: "easeOut", onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [n, reduce]);
  return <span className={className}>{v}</span>;
}
