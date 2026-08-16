'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const REDUCED = '(prefers-reduced-motion: reduce)';

/** Read the motion preference inside an effect, never during render. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED).matches;
}

/**
 * Staggered odometer. Seeded with the TRUE values so the server markup and any
 * no-JS or reduced-motion render show the real numbers (rule 9); the animation
 * drops to zero and climbs back only once an effect has decided it may run.
 * Each key starts 90ms after the previous one and takes 760ms.
 */
export function useCountUp<K extends string>(
  targets: Record<K, number>,
  { autoStart = false }: { autoStart?: boolean } = {},
) {
  // Callers may pass a fresh object every render; the ref keeps `start` stable.
  const targetsRef = useRef(targets);
  useEffect(() => {
    targetsRef.current = targets;
  });
  const fmt = (target: number, n: number) => n.toFixed(Number.isInteger(target) ? 0 : 1);

  const [values, setValues] = useState<Record<K, string>>(() => {
    const seed = {} as Record<K, string>;
    for (const key of Object.keys(targets) as K[]) seed[key] = fmt(targets[key], targets[key]);
    return seed;
  });

  const raf = useRef(0);

  const start = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const targets = targetsRef.current;
    const keys = Object.keys(targets) as K[];
    const tick = () => {
      const t = performance.now() - t0;
      const next = {} as Record<K, string>;
      let done = true;
      keys.forEach((key, i) => {
        const k = Math.max(0, Math.min(1, (t - i * 90) / 760));
        const eased = 1 - Math.pow(1 - k, 3);
        next[key] = fmt(targets[key], targets[key] * eased);
        if (k < 1) done = false;
      });
      setValues(next);
      if (!done) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (autoStart && !prefersReducedMotion() && document.visibilityState === 'visible') start();
    return () => cancelAnimationFrame(raf.current);
  }, [autoStart, start]);

  return { values, start };
}

/** Fires once, the first time the element is at least partly in view. */
export function useInViewOnce<T extends Element>(onEnter: () => void, threshold = 0.35) {
  const ref = useRef<T>(null);
  const handler = useRef(onEnter);
  useEffect(() => {
    handler.current = onEnter;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        handler.current();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return ref;
}

/**
 * Calls `onEnter` every time the element re-enters the viewport, but not for
 * the first paint — the numbers are already truthful there. Used to re-arm the
 * odometer when a counted card scrolls back into view.
 */
export function useReenter<T extends Element>(onEnter: () => void, threshold = 0.35) {
  const ref = useRef<T>(null);
  const handler = useRef(onEnter);
  useEffect(() => {
    handler.current = onEnter;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    let seen = true;
    const io = new IntersectionObserver(
      (entries) => {
        const on = entries[0].isIntersecting;
        if (on && !seen) handler.current();
        seen = on;
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return ref;
}

/**
 * Play/pause on visibility. Returns `paused` plus a `cycle` counter that bumps
 * on every re-entry so a keyed subtree can restart its loop from frame 0.
 */
export function useLoopVisibility<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [state, setState] = useState({ paused: false, cycle: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        const on = entries[0].isIntersecting;
        setState((prev) =>
          prev.paused === !on ? prev : { paused: !on, cycle: on ? prev.cycle + 1 : prev.cycle },
        );
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, ...state };
}
