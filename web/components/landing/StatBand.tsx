'use client';

import { BAND, COUNTS, type BandKey } from '@/lib/landing-data';
import { useCountUp, useInViewOnce } from '@/lib/hooks';
import { Reveal } from './Reveal';
import styles from './StatBand.module.css';

const BAND_TARGETS: Record<BandKey, number> = {
  b1: COUNTS.b1,
  b2: COUNTS.b2,
  b3: COUNTS.b3,
  b4: COUNTS.b4,
};

export function StatBand() {
  const { values, start } = useCountUp(BAND_TARGETS);
  // counts once, when the band first arrives — never again on re-render
  const ref = useInViewOnce<HTMLDivElement>(start);

  return (
    <section className="container section">
      <Reveal>
        <div ref={ref} className={`cellGrid ${styles.grid}`}>
          {BAND.map((stat) => (
            <div key={stat.key} className={styles.cell}>
              <div className={styles.n}>
                {values[stat.key]}
                {stat.suffix}
              </div>
              <div className={styles.label}>{stat.label}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
