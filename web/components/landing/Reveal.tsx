'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/lib/hooks';

type Props = {
  children: ReactNode;
  /** position among its siblings — drives the 70ms enter stagger, capped at 6 */
  index?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
};

/**
 * Scroll reveal. Visible is the render default on the server and on first
 * paint; the element is only ever hidden inside an observer callback that has
 * actually been delivered, so if IntersectionObserver never fires — embedded
 * contexts, no JS, reduced motion — the section reads as static content.
 */
export function Reveal({ children, index = 0, className, style, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            setShown(false);
            continue;
          }
          setShown(true);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      data-in={shown ? '1' : '0'}
      className={['reveal', className].filter(Boolean).join(' ')}
      style={{ transitionDelay: `${Math.min(index, 5) * 70}ms`, ...style }}
    >
      {children}
    </div>
  );
}
