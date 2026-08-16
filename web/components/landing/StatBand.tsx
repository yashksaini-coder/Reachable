'use client';

import { NOT_COMPUTED, type CountStat } from '@/lib/landing-data';
import { useCountUp, useInViewOnce } from '@/lib/hooks';
import { Reveal } from './Reveal';
import styles from './StatBand.module.css';

/** Only the measured numbers animate; a null (not computed) stays the literal. */
const targets = (stats: CountStat[]) =>
  Object.fromEntries(stats.filter((s) => s.n != null).map((s) => [s.key, s.n as number]));

export function StatBand({ band }: { band: CountStat[] }) {
  const { values, start } = useCountUp(targets(band));
  // counts once, when the band first arrives — never again on re-render
  const ref = useInViewOnce<HTMLDivElement>(start);

  return (
    <section className="container section">
      <Reveal>
        <div ref={ref} className={`cellGrid ${styles.grid}`}>
          {band.map((stat) => (
            <div key={stat.key} className={styles.cell}>
              <div className={styles.n} style={stat.n == null ? { color: 'var(--dim)' } : undefined}>
                {stat.n == null ? NOT_COMPUTED : values[stat.key]}
                {stat.n == null ? '' : stat.suffix}
              </div>
              <div className={styles.label}>{stat.label}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
