import { LINKS } from '@/lib/landing-data';
import { Mark } from './Mark';
import styles from './Header.module.css';

const NAV = [
  { href: '#answers', label: 'Six answers' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#verdicts', label: 'Verdicts' },
  { href: '#window', label: 'Install window' },
];

export function Header() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <Mark />
          <span className={styles.wordmark}>Reachable</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map((item) => (
            <a key={item.href} className={styles.link} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <a className={styles.docs} href={LINKS.docs}>
            Docs
          </a>
        </div>
      </div>
    </header>
  );
}
