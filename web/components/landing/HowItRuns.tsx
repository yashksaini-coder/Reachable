import { STEPS } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import styles from './HowItRuns.module.css';

export function HowItRuns() {
  return (
    <section className="container section">
      <Reveal className={styles.copy}>
        <span className="eyebrow">how it runs</span>
        <h2 className="h2">Three steps, then it watches.</h2>
      </Reveal>

      <div className={styles.grid}>
        {STEPS.map((step, i) => (
          <Reveal key={step.n} index={i}>
            <div className={styles.stepHead}>
              <span className={styles.n}>{step.n}</span>
              <span className="ruleFade" />
            </div>
            <h3 className={styles.title}>{step.title}</h3>
            <p className={styles.body}>{step.body}</p>
            <code className={styles.cmd}>{step.cmd}</code>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
