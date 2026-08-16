import { C } from '@/lib/verdict';
import { Reveal } from './Reveal';
import { WindowTimeline } from './WindowTimeline';
import styles from './InstallWindow.module.css';

const NOTES = [
  { glyph: '▲', color: C.l1, text: 'five lockfiles resolved inside the window' },
  { glyph: '▲', color: C.l2, text: 'one commit removed the pins after the fact' },
  { glyph: '◌', mono: true, text: 'the dashed edge is an upper bound, never a claim' },
];

export function InstallWindow() {
  return (
    <section id="window" className="container section">
      <div className={styles.split}>
        <Reveal>
          <span className="eyebrow">the hard question</span>
          <h2 className="h2">Who pulled it in while it was still installable?</h2>
          <p className={`lead ${styles.copy}`}>
            A removed version is not a resolved incident. Reachable intersects every lockfile write
            with the window the version was actually installable in — and marks the edge of that
            window as an upper bound, because registries do not record removal times.
          </p>
          <div className={styles.notes}>
            {NOTES.map((note) => (
              <div key={note.text} className={styles.note}>
                <span
                  className={note.mono ? styles.markerMono : styles.marker}
                  style={note.color ? { color: note.color } : undefined}
                  aria-hidden="true"
                >
                  {note.glyph}
                </span>
                <span>{note.text}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal index={1} className={styles.card}>
          <div className={styles.cardHead}>
            <span className="eyebrow">Q3 · installable window</span>
            <span className="metaMono">6 rows · 47ms · warm</span>
          </div>
          <div className={styles.cardBody}>
            <WindowTimeline />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
