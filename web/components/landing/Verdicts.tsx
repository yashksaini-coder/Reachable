import type { CSSProperties } from 'react';
import { DIST, LEVELS } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import styles from './Verdicts.module.css';

export function Verdicts() {
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
        {DIST.map((d) => (
          <div key={d.color} className={styles.segment} style={{ width: d.w, background: d.color }} />
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
