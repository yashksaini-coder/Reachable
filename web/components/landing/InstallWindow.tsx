import type { LandingModel } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import { WindowTimeline } from './WindowTimeline';
import styles from './InstallWindow.module.css';

type Props = { timeline: LandingModel['timeline']; meta: string; notes: LandingModel['windowNotes'] };

export function InstallWindow({ timeline, meta, notes }: Props) {
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
            {notes.map((note) => (
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
            <span className="metaMono">{meta}</span>
          </div>
          <div className={styles.cardBody}>
            {timeline ? (
              <WindowTimeline data={timeline} />
            ) : (
              <p className="metaMono">this advisory is not time-bounded — no installable window to draw</p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
