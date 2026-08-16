import { LINKS } from '@/lib/landing-data';
import { Mark } from './Mark';
import styles from './Footer.module.css';

const LINK_ROWS = [
  { href: '#answers', label: 'report' },
  { href: '#verdicts', label: 'verdicts' },
  { href: LINKS.docs, label: 'docs' },
  { href: LINKS.status, label: 'status' },
];

export function Footer({ snapshot }: { snapshot: string }) {
  return (
    <footer className={`container ${styles.footer}`}>
      <div className={styles.brand}>
        <Mark size={15} color="var(--dim)" detail={false} />
        <span className={styles.wordmark}>reachable</span>
      </div>

      <div className={styles.links}>
        {LINK_ROWS.map((row) => (
          <a key={row.label} className={styles.link} href={row.href}>
            {row.label}
          </a>
        ))}
      </div>

      <span className={styles.snapshot}>graph snapshot {snapshot}</span>
    </footer>
  );
}
