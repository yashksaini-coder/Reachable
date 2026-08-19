"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/hooks";
import { MatrixLoader } from "./matrix-loader";

// Shown once per browser session, on the landing only, and nothing else in the app can trigger it.
//
// The landing is already painted underneath: this only ever mounts from an effect, so a reader with
// no JS, a crawler, or anyone who arrives after the first view never sees an overlay at all — the
// one place on this landing that would otherwise invert Reveal's visible-by-default rule.
const KEY = "reachable:seen-loader";
const SWEEP = 1100; // the wavefront
const FADE = 450; // and the blur-fade out
const CEILING = 2600; // never hold the page longer than this, whatever the frame budget

export function LoaderGate() {
  const [phase, setPhase] = useState<"idle" | "run" | "out">("idle");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      return; // storage blocked: treat as already seen rather than replay on every view
    }
    // Raised on the next frame, not in the effect body: the landing paints first, and the overlay
    // is only ever added on top of content that is already there.
    const raf = requestAnimationFrame(() => setPhase("run"));
    const bail = setTimeout(() => setPhase("out"), CEILING);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(bail);
    };
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => setPhase("idle"), FADE);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] grid place-items-center bg-bg transition-[opacity,filter] ease-[var(--ease)]"
      style={{
        transitionDuration: `${FADE}ms`,
        opacity: phase === "out" ? 0 : 1,
        filter: phase === "out" ? "blur(12px)" : "blur(0px)",
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
    >
      <MatrixLoader ms={SWEEP} onDone={() => setPhase("out")} />
    </div>
  );
}
