import type { LandingModel } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import { TypedStatement } from './TypedStatement';
import styles from './Evidence.module.css';

export function Evidence({ evidence }: { evidence: LandingModel['evidence'] }) {
  return (
    <section id="evidence" className="container section">
      <div className={styles.split}>
        <Reveal className={styles.hydra}>
          <div className={styles.hydraHead}>
            <span className={styles.tag}>hydradb</span>
            <span className={styles.question}>{evidence.question}</span>
            <span className={`metaMono ${styles.meta}`}>{evidence.meta}</span>
          </div>
          <TypedStatement statement={evidence.cypher} />
        </Reveal>

        <Reveal index={1}>
          <span className="eyebrow">no black boxes</span>
          <h2 className="h2">Every number ships with the statement behind it.</h2>
          <p className={`lead ${styles.copy}`}>
            Each answer card carries the executed query, the row count and the measured latency.
            Collapse it if you trust it. It is never hidden, and nothing on the page is an
            estimate: an uncomputed value reads “not computed”, an unread service reads “unscanned”.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
