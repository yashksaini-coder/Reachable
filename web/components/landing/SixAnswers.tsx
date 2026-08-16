import type { LandingModel } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import styles from './SixAnswers.module.css';

export function SixAnswers({ questions }: { questions: LandingModel['questions'] }) {
  return (
    <section id="answers" className="container section">
      <Reveal>
        <span className="eyebrow">the report</span>
        <h2 className={`h2 ${styles.h2}`}>Six questions, answered on one page.</h2>
      </Reveal>

      <div className={`cellGrid ${styles.grid}`}>
        {questions.map((q, i) => (
          <Reveal key={q.tag} index={i} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.tag}>{q.tag}</span>
              <span className="ruleFade" />
              <span className="metaMono">{q.meta}</span>
            </div>
            <h3 className={styles.title}>{q.title}</h3>
            <p className={styles.body}>{q.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
