import { RUNS } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import styles from './HowItRuns.module.css';

export function HowItRuns() {
  return (
    <section className="container section">
      <Reveal className={styles.copy}>
        <span className="eyebrow">what runs where</span>
        <h2 className="h2">One node. One console. Nothing else to install.</h2>
      </Reveal>

      <div className={styles.grid}>
        {RUNS.map((step, i) => (
          <Reveal key={step.n} index={i}>
            <div className={styles.stepHead}>
              <span className={styles.n}>{step.n}</span>
              <span className="ruleFade" />
            </div>
            <h3 className={styles.title}>{step.title}</h3>
            <p className={styles.body}>{step.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
