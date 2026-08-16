import { CYPHER } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import { TypedStatement } from './TypedStatement';
import styles from './Evidence.module.css';

export function Evidence() {
  return (
    <section id="evidence" className="container section">
      <div className={styles.split}>
        <Reveal className={styles.hydra}>
          <div className={styles.hydraHead}>
            <span className={styles.tag}>hydradb</span>
            <span className={styles.question}>
              which services resolve an affected version, and at what level?
            </span>
            <span className={`metaMono ${styles.meta}`}>8 rows · 38ms · warm</span>
          </div>
          <TypedStatement statement={CYPHER} />
        </Reveal>

        <Reveal index={1}>
          <span className="eyebrow">no black boxes</span>
          <h2 className="h2">Every number ships with the statement behind it.</h2>
          <p className={`lead ${styles.copy}`}>
            Each answer card carries the executed query, the row count and the latency — cold or
            warm. Collapse it if you trust it. It is never hidden, and nothing on the page is an
            estimate: an uncomputed value reads “not computed”, an unread service reads “unscanned”.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
