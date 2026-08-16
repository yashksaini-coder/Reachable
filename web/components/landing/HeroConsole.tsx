'use client';

import type { CSSProperties } from 'react';
import { ADVISORY, COUNTS, STRIP, type StripKey } from '@/lib/landing-data';
import { C } from '@/lib/verdict';
import { useCountUp, useReenter } from '@/lib/hooks';
import { BlastGraph } from './BlastGraph';
import { Reveal } from './Reveal';
import styles from './HeroConsole.module.css';

const STRIP_TARGETS: Record<StripKey, number> = {
  s1: COUNTS.s1,
  s2: COUNTS.s2,
  s3: COUNTS.s3,
  s4: COUNTS.s4,
  s5: COUNTS.s5,
  s6: COUNTS.s6,
};

const LEGEND: { bar?: string; dot?: string; text: string }[] = [
  { bar: C.l1, text: 'resolved while installable' },
  { dot: C.l2, text: 'L2 act now' },
  { dot: C.l1, text: 'L1 imported' },
  { dot: C.l0, text: 'L0 present only' },
  { dot: C.unk, text: 'unscanned' },
];

/**
 * The report's own stat strip and blast graph, shown as a product card rather
 * than a marketing illustration. The numerals render their true values and are
 * animated by script; the odometer re-arms when the card scrolls back in.
 */
export function HeroConsole() {
  const { values, start } = useCountUp(STRIP_TARGETS, { autoStart: true });
  const ref = useReenter<HTMLDivElement>(start);

  return (
    <Reveal>
      <div ref={ref} className={styles.console}>
        <div className={styles.scan} aria-hidden="true" />

        <div className={styles.head}>
          <span className={styles.advisory}>{ADVISORY}</span>
          <span className={styles.level}>act now</span>
          <span className={styles.spacer} />
          <span className="metaMono">8 statements · 214 rows · 1.9s</span>
        </div>

        <div className={styles.strip}>
          {STRIP.map((stat) => (
            <div key={stat.key} className={styles.cell}>
              <div
                className={`statRule ${styles.rule}`}
                style={{ '--rule-color': stat.rule } as CSSProperties}
              />
              <div className={styles.value} style={{ color: stat.fg }}>
                {values[stat.key]}
              </div>
              <div className={styles.label}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div className={styles.graphHead}>
          <div className={`eyebrow ${styles.graphLabel}`}>blast radius</div>
        </div>

        <div className={styles.graphBody}>
          <BlastGraph />
        </div>

        <div className={styles.legend}>
          {LEGEND.map((item) => (
            <span key={item.text} className={styles.legendItem}>
              {item.bar ? (
                <span className={styles.swatchBar} style={{ background: item.bar }} />
              ) : (
                <span className={styles.swatchDot} style={{ background: item.dot }} />
              )}
              {item.text}
            </span>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
