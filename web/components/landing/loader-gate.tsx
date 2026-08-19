"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/hooks";
import { MatrixLoader } from "./matrix-loader";

// Once per browser session, landing only. Mounts from an effect, so the page is painted underneath
// and a reader with no JS never sees an overlay.
const KEY = "reachable:seen-loader";
const SWEEP = 4100; // the wavefront
const FADE = 450; // and the blur-fade out
const CEILING = 5600; // hard stop, must clear SWEEP or it would cut the animation short

export function LoaderGate() {
  const [phase, setPhase] = useState<"idle" | "run" | "out">("idle");
  const bail = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Also the skip: nobody should be held behind an overlay they cannot dismiss.
  const finish = useCallback(() => {
    if (bail.current) clearTimeout(bail.current);
    setPhase((p) => (p === "run" ? "out" : p));
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      return; // storage blocked: treat as already seen rather than replay on every view
    }
    // Next frame, not the effect body: the landing paints first.
    const raf = requestAnimationFrame(() => setPhase("run"));
    bail.current = setTimeout(finish, CEILING);
    return () => {
      cancelAnimationFrame(raf);
      if (bail.current) clearTimeout(bail.current);
    };
  }, [finish]);

  useEffect(() => {
    if (phase !== "run") return;
    window.addEventListener("keydown", finish, { once: true });
    return () => window.removeEventListener("keydown", finish);
  }, [phase, finish]);

  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => setPhase("idle"), FADE);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden
      onClick={finish}
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
