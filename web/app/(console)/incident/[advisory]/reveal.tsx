"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// One semantic chunk settling into place on scroll (once). Rule 9: content is never dimmed or
// hidden by default — the server markup is fully visible; only translateY settles (8px → 0), and
// only after the viewport callback fires. Stagger siblings with `delay`.
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(className, "print:transform-none!")}
      initial={false}
      whileInView={reduce ? undefined : { y: [8, 0] }}
      viewport={{ once: true, amount: 0.05 }}
      transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.32, 0.72, 0, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
