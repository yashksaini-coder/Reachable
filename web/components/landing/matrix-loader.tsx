"use client";

import { useEffect, useRef } from "react";

// Radial wavefront across a pixel grid, from the design piece's maths. Palette moved to the brand
// ramp: the original's amber→red is --l1/--l2, which mean "imported" and "act now" elsewhere.

const N = 11; // grid is N×N
// Cells come off the block with the design's 0.72/0.28 split; 418px suited a canvas stage, not a page.
const BLOCK = 152;
const CELL = Math.round((BLOCK / N) * 0.72); // 10
const GAP = Math.round((BLOCK / N) * 0.28); // 4
const RAMP = 0.34; // width, in sweep units, of one cell's own fade-up
const LEAD = 1 - RAMP; // a cell starts at LEAD × its normalised distance

const HALO = Math.round(BLOCK * 2.15); // the design's halo-to-grid ratio
const IDLE = "#262c3a"; // --color-input
const WARM = [255, 176, 138]; // --color-signal-2
const HOT = [255, 106, 26]; // --color-signal

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a: number[], b: number[], t: number) => {
  const k = clamp(t);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
};

export function MatrixLoader({ ms, onDone }: { ms: number; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  // In a ref so a new callback identity cannot restart the sweep.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const cells = Array.from(host.current?.children ?? []) as HTMLElement[];
    if (!cells.length) return;

    // Distance from centre, corners = 1: same ramp width for every cell, only the start differs.
    const c = (N - 1) / 2;
    const dmax = Math.hypot(c, c);
    const dist = cells.map((_, i) => Math.hypot((i % N) - c, Math.floor(i / N) - c) / dmax);

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const u = clamp((now - t0) / ms);
      const p = (1 - Math.cos(Math.PI * u)) / 2; // easeInOutSine, as authored
      for (let i = 0; i < cells.length; i++) {
        const f = clamp((p - LEAD * dist[i]) / RAMP);
        const lit = f > 0.001;
        const el = cells[i];
        // Snaps to WARM on lighting — easing that step smears the wavefront.
        el.style.background = lit ? mix(WARM, HOT, (f - 0.15) / 0.85) : IDLE;
        el.style.transform = `scale(${lit ? 0.9 + 0.28 * Math.sin(Math.PI * f) + 0.1 * f : 0.78})`;
      }
      if (u < 1) raf = requestAnimationFrame(frame);
      else done.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ms]);

  return (
    <div className="relative grid place-items-center">
      {/* halo: hot at low alpha, well behind the grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full blur-[6px]"
        style={{ width: HALO, height: HALO, background: "radial-gradient(circle, rgba(255,106,26,.13) 0%, transparent 62%)" }}
      />
      <div
        ref={host}
        aria-hidden
        className="relative"
        style={{ display: "grid", gap: `${GAP}px`, gridTemplateColumns: `repeat(${N}, ${CELL}px)` }}
      >
        {Array.from({ length: N * N }, (_, i) => (
          <span key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: IDLE, transform: "scale(0.78)" }} />
        ))}
      </div>
    </div>
  );
}
