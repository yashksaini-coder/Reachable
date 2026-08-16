'use client';

import type { CSSProperties } from 'react';
import type { TimelineData } from '@/lib/landing-data';
import { C } from '@/lib/verdict';
import { useLoopVisibility } from '@/lib/hooks';
import styles from './WindowTimeline.module.css';

/**
 * The installable window, drawn from the real Q2/Q3 rows and authored at
 * roughly 1:1 with its rendered box so the labels land near 11px. Four bands —
 * window label, advisory, bar + upper bound, marker rows — so nothing crosses.
 * The bar is always at its true full width; only the playhead and the settle of
 * the markers move. It loops on its own, pauses off-screen, restarts on
 * re-entry, and takes no user interaction.
 */

const X0 = 26;
const X1 = 404;
const AXIS_Y = 108;
const BAND = 50;
const ROW = 17;
/** a marker label is ~45 units wide, so closer markers cluster into one `name +n` node */
const CLUSTER = 45;
const H = 3600;
const D = 86400;

const tri = (x: number, y: number) => `M${x} ${y - 10} l5 10 h-10 z`;
const mono12 = { fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 400 } as const;
const mono13 = { fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 400 } as const;
const MONTH = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const day = (t: number) => {
  const d = new Date(t * 1000);
  return `${MONTH[d.getUTCMonth()]} ${pad(d.getUTCDate())}`;
};

export function WindowTimeline({ data }: { data: TimelineData }) {
  const { ref, paused, cycle } = useLoopVisibility<HTMLDivElement>();
  const { liveFrom, liveTo, advisoryAt, commits, versions } = data;

  // Axis: hourly ticks when the window fits in a day, daily otherwise. It starts one
  // unit before the window opens and runs seven units — later commits are grouped
  // into one labelled overflow marker rather than squeezed or dropped.
  const unit = liveTo - liveFrom <= 6 * H ? H : D;
  const t0 = Math.floor(liveFrom / unit) * unit - unit;
  const ticks = 7;
  const t1 = t0 + unit * (ticks - 1);
  const x = (t: number) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
  const barX = x(liveFrom);
  const barEnd = Math.min(x(liveTo), X1);
  const barW = barEnd - barX;
  const advX = x(advisoryAt);
  const advOnEdge = Math.abs(advX - barEnd) < 8;
  const upper = data.liveToKind !== 'exact';

  const sorted = [...commits].sort((a, b) => a.at - b.at);
  const marks: { x: number; label: string; n: number }[] = [];
  const later: { at: number; service: string }[] = [];
  for (const c of sorted) {
    if (c.at > t1) {
      later.push(c);
      continue;
    }
    const cx = x(c.at);
    const last = marks[marks.length - 1];
    if (last && cx - last.x < CLUSTER) {
      last.n += 1;
      last.label = `${last.label.replace(/ \+\d+$/, '')} +${last.n - 1}`;
    } else marks.push({ x: cx, label: c.service, n: 1 });
  }
  if (later.length) {
    marks.push({
      x: X1,
      label: `+${later.length} later · ${[...new Set(later.map((c) => day(c.at)))].join(', ')}`,
      n: later.length,
    });
  }
  const height = Math.max(226, AXIS_Y + BAND + ROW * marks.length + 12);
  const inWindow = commits.filter((c) => c.evidence.startsWith('in_window')).length;

  return (
    <div ref={ref}>
      <svg
        key={cycle}
        viewBox={`0 0 452 ${height}`}
        className={`${styles.svg} ${paused ? styles.paused : ''}`}
        role="img"
        aria-label={`Timeline: ${inWindow} of ${commits.length} lockfile commits inside the installable window ${hhmm(liveFrom)}–${hhmm(liveTo)} UTC on ${day(liveFrom)}${upper ? ' (upper bound)' : ''}`}
      >
        {/* axis */}
        <line x1={X0} y1={AXIS_Y} x2={X1} y2={AXIS_Y} stroke={C.line} strokeWidth={1} />
        {Array.from({ length: ticks }, (_, i) => {
          const t = t0 + unit * i;
          return (
            <g key={t}>
              <line x1={x(t)} y1={AXIS_Y} x2={x(t)} y2={AXIS_Y + 5} stroke={C.line} strokeWidth={1} />
              <text x={x(t)} y={AXIS_Y + 20} textAnchor="middle" fill={C.dim} style={mono12}>
                {unit === H ? hhmm(t) : day(t)}
              </text>
            </g>
          );
        })}

        {/* band 1 — what the window is */}
        <text x={barX} y={24} fill={C.sig2} style={mono13}>
          installable · {versions} version{versions === 1 ? '' : 's'} · {day(liveFrom)}
          {unit === H ? ' utc' : ''}
        </text>

        {/* band 2 — the advisory, in its own register, unless it is the bound itself */}
        {!advOnEdge && (
          <>
            <text x={advX - 16} y={46} textAnchor="end" fill={C.mut} style={mono12}>
              advisory published
            </text>
            <path d={`M${advX - 13} 50 L${advX - 2} ${AXIS_Y - 9}`} stroke={C.line} strokeWidth={1} fill="none" />
            <path d={`M${advX} ${AXIS_Y - 7} l5 5 -5 5 -5 -5 z`} fill={C.mut} />
          </>
        )}

        {/* band 3 — the bar at its true full width, and the upper bound */}
        <rect x={barX} y={58} width={barW} height={24} rx={4} fill="var(--sigfill)" stroke={C.sig} strokeWidth={1} />
        <rect x={barX} y={58} width={barW} height={24} rx={4} fill={C.sig} className={styles.glow} />
        {upper && (
          <line x1={barEnd} y1={52} x2={barEnd} y2={88} stroke={C.sig} strokeWidth={1.4} strokeDasharray="3 3" />
        )}
        {/* the dashed edge is an upper bound, never a claim — the label stays */}
        <text x={barEnd - 4} y={102} textAnchor="end" fill={C.sig2} style={mono12}>
          {upper ? 'upper bound' : 'removed'}
          {advOnEdge ? ' · advisory published' : ''}
        </text>
        <line
          x1={barX}
          y1={56}
          x2={barX}
          y2={AXIS_Y}
          stroke={C.sig}
          strokeWidth={1.2}
          className={styles.sweep}
          style={{ '--bar-w': `${barW}px` } as CSSProperties}
        />

        {/* band 4 — commit markers on stacked baselines */}
        {marks.map((m, i) => {
          const y = AXIS_Y + BAND + ROW * i;
          const fits = m.x + 11 + m.label.length * 7.2 <= 448;
          return (
            <g key={`${m.x}-${m.label}`} className={styles.mark} style={{ '--delay': `${1.1 + 0.8 * i}s` } as CSSProperties}>
              <path d={tri(m.x, y)} fill={C.l1} />
              <text x={fits ? m.x + 11 : m.x - 11} y={y - 1} textAnchor={fits ? 'start' : 'end'} fill={C.l1} style={mono12}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
