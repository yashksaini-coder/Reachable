'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/hooks';
import styles from './TypedStatement.module.css';

/**
 * The executed statement types itself in when the card first scrolls into view,
 * at 2 characters every 18ms. The complete statement is the render default and
 * is only cleared at the moment the typing actually begins — the statement is
 * never hidden, so a page where the observer never fires still shows all of it.
 */
export function TypedStatement({ statement }: { statement: string }) {
  const ref = useRef<HTMLPreElement>(null);
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
    <pre ref={ref} className={styles.pre}>
      {typed}
      <span className={styles.cursor} aria-hidden="true">
        ▍
      </span>
    </pre>
  );
}
