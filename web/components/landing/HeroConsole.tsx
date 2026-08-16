'use client';

import type { CSSProperties } from 'react';
import { NOT_COMPUTED, type BlastData, type CountStat } from '@/lib/landing-data';
import { C } from '@/lib/verdict';
import { useCountUp, useReenter } from '@/lib/hooks';
import { BlastGraph } from './BlastGraph';
import { Reveal } from './Reveal';
import styles from './HeroConsole.module.css';

const LEGEND: { bar?: string; dot?: string; text: string }[] = [
  { bar: C.l1, text: 'resolved while installable' },
  { dot: C.l2, text: 'L2 act now' },
  { dot: C.l1, text: 'L1 imported' },
  { dot: C.l0, text: 'L0 present only' },
  { dot: C.unk, text: 'unscanned' },
];

type Props = {
  advisory: string;
  level: { label: string; color: string; bg: string };
  meta: string;
  strip: CountStat[];
  blast: BlastData | null;
};

/** Only the measured numbers animate; a null (not computed) stays the literal. */
export const countTargets = (stats: CountStat[]) =>
  Object.fromEntries(stats.filter((s) => s.n != null).map((s) => [s.key, s.n as number]));

/**
 * The report's own stat strip and blast graph, shown as a product card rather
 * than a marketing illustration. The numerals render their true values and are
 * animated by script; the odometer re-arms when the card scrolls back in.
 */
export function HeroConsole({ advisory, level, meta, strip, blast }: Props) {
  const { values, start } = useCountUp(countTargets(strip), { autoStart: true });
  const ref = useReenter<HTMLDivElement>(start);

  return (
    <Reveal>
      <div ref={ref} className={styles.console}>
        <div className={styles.scan} aria-hidden="true" />

        <div className={styles.head}>
          <span className={styles.advisory}>{advisory}</span>
          <span className={styles.level} style={{ color: level.color, background: level.bg }}>
            {level.label}
          </span>
          <span className={styles.spacer} />
          <span className="metaMono">{meta}</span>
        </div>

        <div className={styles.strip}>
          {strip.map((stat) => (
            <div key={stat.key} className={styles.cell}>
              <div
                className={`statRule ${styles.rule}`}
                style={{ '--rule-color': stat.rule } as CSSProperties}
              />
              <div className={styles.value} style={{ color: stat.n == null ? C.dim : stat.fg }}>
                {stat.n == null ? NOT_COMPUTED : values[stat.key]}
              </div>
              <div className={styles.label}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div className={styles.graphHead}>
          <div className={`eyebrow ${styles.graphLabel}`}>
            blast radius{blast?.note ? ` · ${blast.note}` : ''}
          </div>
        </div>

        <div className={styles.graphBody}>
          {blast ? <BlastGraph data={blast} /> : <p className="metaMono">no service resolves an affected version</p>}
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
