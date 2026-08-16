import { LINKS } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import styles from './Cta.module.css';

export function Cta() {
  return (
    <section id="cta" className={`container ${styles.section}`}>
      <Reveal className={styles.card}>
        <div className={styles.glow} aria-hidden="true" />
        <h2 className={styles.h2}>Point it at one repository and read the first report tonight.</h2>
        <p className={`lead ${styles.lead}`}>
          Read-only GitHub access, lockfiles and commit metadata linked into one graph, six answers
          per advisory from the first ingest onward.
        </p>
        <div className={styles.actions}>
          <a className="btn btnPrimary" href={LINKS.connect}>
            Connect a repository
          </a>
          <a className="btn btnOutline" href={LINKS.console}>
            Open the console
          </a>
          <span className={styles.note}>no agent to install</span>
        </div>
      </Reveal>
    </section>
  );
}
