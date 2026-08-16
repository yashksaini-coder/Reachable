'use client';

import type { CSSProperties } from 'react';
import { C } from '@/lib/verdict';
import { useLoopVisibility } from '@/lib/hooks';
import styles from './WindowTimeline.module.css';

/**
 * The installable window, authored at roughly 1:1 with its rendered box so the
 * labels land near 11px instead of scaling down to 7px. Four separate bands —
 * window label, advisory, bar + upper bound, marker rows — so nothing crosses.
 * It loops on its own, pauses off-screen, restarts on re-entry, and takes no
 * user interaction.
 */

const DAYS = ['08', '09', '10', '11', '12', '13', '14', '15'];
const X0 = 26;
const X1 = 404;
const DX = (X1 - X0) / (DAYS.length - 1);
const AXIS_Y = 108;

const BAR_X = X0 + DX * 1.1;
const BAR_W = 118;
const BAR_END = BAR_X + BAR_W;
const ADV_X = X0 + DX * 3.35;

/** marker rows start well below the day-label row at axisY + 20 */
const BAND = 50;

/** two commits 0.15 days apart would overlap, so they cluster into the ×n node */
const MARKS = [
  { d: 2.05, label: 'alpha', dy: 0, delay: '1.1s' },
  { d: 2.55, label: 'bravo', dy: 17, delay: '1.9s' },
  { d: 2.98, label: 'charlie +3', dy: 34, delay: '2.7s' },
];

/** apex up, matching the ▲ in the legend */
const tri = (x: number, y: number) => `M${x} ${y - 10} l5 10 h-10 z`;

const mono12 = { fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 400 } as const;
const mono13 = { fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 400 } as const;

export function WindowTimeline() {
  const { ref, paused, cycle } = useLoopVisibility<HTMLDivElement>();

  return (
    <div ref={ref}>
      <svg
        key={cycle}
        viewBox="0 0 452 226"
        className={`${styles.svg} ${paused ? styles.paused : ''}`}
        role="img"
        aria-label="Timeline: five lockfiles resolved inside the installable window, one commit removed the pins after the fact"
      >
        {/* axis */}
        <line x1={X0} y1={AXIS_Y} x2={X1} y2={AXIS_Y} stroke={C.line} strokeWidth={1} />
        {DAYS.map((day, i) => (
          <g key={day}>
            <line
              x1={X0 + DX * i}
              y1={AXIS_Y}
              x2={X0 + DX * i}
              y2={AXIS_Y + 5}
              stroke={C.line}
              strokeWidth={1}
            />
            <text
              x={X0 + DX * i}
              y={AXIS_Y + 20}
              textAnchor="middle"
              fill={C.dim}
              style={mono12}
            >
              aug {day}
            </text>
          </g>
        ))}

        {/* band 1 — what the window is */}
        <text x={BAR_X} y={24} fill={C.sig2} style={mono13}>
          installable · 2 versions
        </text>

        {/* band 2 — the advisory, in its own register: axis diamond + leader */}
        <text x={ADV_X - 16} y={46} textAnchor="end" fill={C.mut} style={mono12}>
          advisory published
        </text>
        <path
          d={`M${ADV_X - 13} 50 L${ADV_X - 2} ${AXIS_Y - 9}`}
          stroke="#39404f"
          strokeWidth={1}
          fill="none"
        />
        <path d={`M${ADV_X} ${AXIS_Y - 7} l5 5 -5 5 -5 -5 z`} fill={C.mut} />

        {/* band 3 — the bar at its true full width, and the upper bound */}
        <rect
          x={BAR_X}
          y={58}
          width={BAR_W}
          height={24}
          rx={4}
          fill="var(--sigfill)"
          stroke={C.sig}
          strokeWidth={1}
        />
        <rect
          x={BAR_X}
          y={58}
          width={BAR_W}
          height={24}
          rx={4}
          fill={C.sig}
          className={styles.glow}
        />
        <line
          x1={BAR_END}
          y1={52}
          x2={BAR_END}
          y2={88}
          stroke={C.sig}
          strokeWidth={1.4}
          strokeDasharray="3 3"
        />
        {/* the dashed edge is an upper bound, never a claim — the label stays */}
        <text x={BAR_END - 4} y={102} textAnchor="end" fill={C.sig2} style={mono12}>
          upper bound
        </text>
        <line
          x1={BAR_X}
          y1={56}
          x2={BAR_X}
          y2={AXIS_Y}
          stroke={C.sig}
          strokeWidth={1.2}
          className={styles.sweep}
        />

        {/* band 4 — commit markers on stacked baselines */}
        {MARKS.map((m) => (
          <g
            key={m.label}
            className={styles.mark}
            style={{ '--delay': m.delay } as CSSProperties}
          >
            <path d={tri(X0 + DX * m.d, AXIS_Y + BAND + m.dy)} fill={C.l1} />
            <text
              x={X0 + DX * m.d + 11}
              y={AXIS_Y + BAND - 1 + m.dy}
              fill={C.l1}
              style={mono12}
            >
              {m.label}
            </text>
          </g>
        ))}
        <g className={styles.mark} style={{ '--delay': '3.5s' } as CSSProperties}>
          <path d={tri(BAR_END, AXIS_Y + BAND + 51)} fill={C.l2} />
          <text x={BAR_END + 11} y={AXIS_Y + BAND + 50} fill={C.l2} style={mono12}>
            pins removed
          </text>
        </g>
      </svg>
    </div>
  );
}
