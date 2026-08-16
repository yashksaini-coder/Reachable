"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// One semantic chunk entering on scroll (once). Stagger siblings with `delay`.
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0, delay }}
    >
      {children}
    </motion.div>
  );
}
