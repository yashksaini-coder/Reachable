import Link from 'next/link';
import { MCP_TOOLS } from '@/lib/landing-data';
import { Reveal } from './Reveal';
import styles from './Agents.module.css';

// The same questions, in the editor. Tool names are the wire names asserted in test_mcp.py.
export function Agents() {
  return (
    <section className="container section">
      <Reveal className={styles.copy}>
        <span className="eyebrow">in the editor</span>
        <h2 className="h2">Twelve tools, for the agent fixing it.</h2>
        <p className={styles.lead}>
          An MCP server over stdio, on the official SDK. It computes nothing — each tool is one call to
          the worker, so an agent gets the same answers as the console, with the statement that
          produced them. Eleven read; one writes, and says so.
        </p>
      </Reveal>

      <div className={styles.grid}>
        {MCP_TOOLS.map((t, i) => (
          <Reveal key={t.name} index={i} className={styles.tool}>
            <span className={styles.name}>{t.name}</span>
            <span className={styles.body}>{t.body}</span>
            {t.writes && <span className={styles.writes}>writes</span>}
          </Reveal>
        ))}
      </div>

      <div className={styles.foot}>
        <span>Claude Code · Codex · Cursor · OpenCode — same command and arguments.</span>
        <Link className={styles.link} href="/docs/reference/run">
          How to point it at a worker
        </Link>
      </div>
    </section>
  );
}
