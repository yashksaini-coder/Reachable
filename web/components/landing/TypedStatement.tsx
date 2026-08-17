'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/hooks';
import styles from './TypedStatement.module.css';

/**
 * The executed statement types itself in when the card first scrolls into view, at 2 characters
 * every 18ms. Two rules keep it honest and still: (1) the complete statement is the render
 * default and is only cleared at the moment typing begins — a page where the observer never
 * fires shows all of it; (2) the box is sized by an invisible copy of the full statement in the
 * same grid cell, so nothing moves or scrolls while the characters arrive. Long lines wrap; the
 * card never scrolls sideways.
 */
export function TypedStatement({ statement }: { statement: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(statement);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;

    let timer: ReturnType<typeof setInterval>;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        let i = 0;
        setTyped('');
        timer = setInterval(() => {
          i += 2;
          setTyped(statement.slice(0, i));
          if (i >= statement.length) clearInterval(timer);
        }, 18);
      },
      { threshold: 0.3 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [statement]);

  return (
    <div ref={ref} className={styles.box}>
      {/* sizing layer: the full statement, invisible, reserves the final height */}
      <pre className={`${styles.pre} ${styles.ghost}`} aria-hidden="true">
        {statement}
        <span className={styles.cursor}>▍</span>
      </pre>
      <pre className={styles.pre}>
        {typed}
        <span className={styles.cursor} aria-hidden="true">
          ▍
        </span>
      </pre>
    </div>
  );
}
