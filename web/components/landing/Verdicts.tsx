import type { CSSProperties } from 'react';
import { LEVELS, type LandingModel } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import styles from './Verdicts.module.css';

export function Verdicts({ dist }: { dist: LandingModel['dist'] }) {
  const total = dist.reduce((n, d) => n + d.n, 0);
  return (
    <section id="verdicts" className="container section">
      <Reveal className={styles.copy}>
        <span className="eyebrow">four verdicts</span>
        <h2 className="h2">Colour means one thing here.</h2>
        <p className="lead">
          A page with no red is the message. Verdicts are computed per service — the highest level
          across its lockfiles — and never softened.
        </p>
      </Reveal>

      <Reveal className={styles.bar}>
        {dist
          .filter((d) => d.n > 0)
          .map((d) => (
            <div
              key={d.label}
              className={styles.segment}
              style={{ width: `${(100 * d.n) / total}%`, background: d.color }}
            />
          ))}
      </Reveal>
      <Reveal className={styles.legend}>
        {dist.map((d) => (
          <span key={d.label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: d.color }} aria-hidden="true" />
            <span style={{ color: d.color }}>{d.n}</span> {d.label}
          </span>
        ))}
      </Reveal>

      <div className={`cellGrid ${styles.grid}`}>
        {LEVELS.map((level, i) => (
          <Reveal key={level.title} index={i} className={styles.card}>
            <div
              className={`statRule ${styles.rule}`}
              style={{ '--rule-color': level.color } as CSSProperties}
            />
            <div className={styles.tag} style={{ color: level.color }}>
              {level.tag}
            </div>
            <div className={styles.title}>{level.title}</div>
            <p className={styles.body}>{level.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
