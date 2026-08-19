"use client";

import { useEffect, useRef } from "react";

// A radial wavefront across a pixel grid, reimplemented from the design piece's own maths so the
// motion is the same: a cell lights when the sweep reaches its distance from the centre, flashes to
// the warm tone, then settles hot.
//
// The palette is the one deliberate change. The design's amber→red sits on top of --l1 and --l2,
// which mean "imported" and "act now" everywhere else here, so a loading animation painted in them
// would read as a verdict. The brand ramp is the same cool→warm→hot movement without the meaning.

const N = 11; // grid is N×N
// The design sizes cells off the block with a 0.72/0.28 split. Same proportion, smaller block: 418px
// suited a 1920×1080 canvas stage, but a page loader wants to read as a mark, not fill the viewport.
const BLOCK = 176;
const CELL = Math.round((BLOCK / N) * 0.72); // 12
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
  // Held in a ref so a new callback identity never restarts the sweep mid-flight.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const cells = Array.from(host.current?.children ?? []) as HTMLElement[];
    if (!cells.length) return;

    // Normalised distance from centre; the corners are 1, so every cell's ramp is the same width
    // and only its start offset differs. That is the whole spatial ordering.
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
        // Snap to WARM the instant it lights — no idle→warm interpolation. That hard flash is the
        // pixel character; easing it turns the wavefront into a smear.
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
