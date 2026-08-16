"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// One semantic chunk settling into place on scroll (once). Content is NEVER invisible: it starts
// at 0.55 opacity + 8px down, so full-page captures, print, and fast scrolls always show it,
// and the motion reads as a settle rather than an appearance. Stagger siblings with `delay`.
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0.55, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.05 }}
      transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0, delay }}
      style={{ willChange: "opacity, transform" }}
    >
      {children}
    </motion.div>
  );
}
