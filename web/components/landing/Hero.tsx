import { LINKS } from '@/lib/landing-data';
import { ArrowRight } from './Mark';
import { HeroConsole } from './HeroConsole';
import styles from './Hero.module.css';

const TRUST = ['read-only access', 'lockfiles never leave your graph', 'answers in under 2s warm'];

export function Hero() {
  return (
    <section className={`container ${styles.hero}`}>
      <div className={styles.glow} aria-hidden="true" />

      <div className={`enter ${styles.eyebrowRow}`}>
        <span className={styles.liveDot} aria-hidden="true" />
        <span className={styles.eyebrow}>supply-chain incident console</span>
      </div>

      <h1 className={`enter ${styles.d1} ${styles.h1}`}>A compromised package. One page of answers.</h1>

      <p className={`enter ${styles.d2} ${styles.lead}`}>
        Reachable reads your lockfiles and commit history and tells you which services are exposed,
        which pulled the package in while it was still installable, and what the same maintainers
        could reach next — with the statement that produced every number.
      </p>

      <div className={`enter ${styles.d3} ${styles.actions}`}>
        <a className="btn btnPrimary" href={LINKS.connect}>
          Connect a repository
        </a>
        <a className="btn btnOutline" href="#answers">
          See a report
          <ArrowRight />
        </a>
      </div>

      <div className={`enter ${styles.d4} ${styles.trust}`}>
        {TRUST.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>

      <HeroConsole />
    </section>
  );
}
