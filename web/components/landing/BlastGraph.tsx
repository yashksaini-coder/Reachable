import type { CSSProperties } from 'react';
import { C } from '@/lib/verdict';

/**
 * The blast radius: version -> dependency -> lockfile -> service, with a verdict
 * dot per service. Amber edges are the lockfiles resolved while the version was
 * still installable. Pure SVG from data — no client code.
 *
 * The 1180-unit viewBox is pinned to a 1000px floor and scrolls inside its card;
 * scaling it down to a narrow column would drop every label to ~6px.
 */

type Node = {
  label: string;
  /** columns 0-2: the second line and the box stroke */
  sub?: string;
  color?: string;
  /** column 3: the verdict and its dot colour */
  v?: string;
  c?: string;
};

const COLS: Node[][] = [
  [{ label: 'pkg-core@2.4.1', sub: 'affected', color: C.l2 }],
  [
    { label: 'wrap-agent@6.0.2', sub: 'dependency', color: C.unk },
    { label: 'direct dependency', sub: 'declared', color: C.unk },
  ],
  [
    { label: 'alpha/pnpm-lock.yaml', sub: 'in window', color: C.l1 },
    { label: 'bravo/package-lock.json', sub: 'in window', color: C.l1 },
    { label: 'charlie/pnpm-lock.yaml', sub: 'in window', color: C.l1 },
    { label: 'golf/package-lock.json', sub: 'after removal', color: C.unk },
  ],
  [
    { label: 'org/service-alpha', v: 'L2', c: C.l2 },
    { label: 'org/service-bravo', v: 'L2', c: C.l2 },
    { label: 'org/service-charlie', v: 'L1', c: C.l1 },
    { label: 'org/service-echo', v: 'L1', c: C.l1 },
    { label: 'org/service-golf', v: 'L0', c: C.l0 },
    { label: 'org/service-hotel', v: 'unscanned', c: C.unk },
  ],
];

const X = [90, 350, 640, 990];
const HEADS = ['version', 'dependency', 'lockfile', 'service'];

const EDGES: [number, number, number, number][] = [
  [0, 0, 1, 0],
  [0, 0, 1, 1],
  [1, 0, 2, 2],
  [1, 1, 2, 0],
  [1, 1, 2, 1],
  [1, 0, 2, 3],
  [2, 0, 3, 0],
  [2, 1, 3, 1],
  [2, 2, 3, 2],
  [2, 2, 3, 3],
  [2, 3, 3, 4],
];

const yOf = (i: number, n: number) => 46 + (i + 0.5) * (232 / n);

const monoLabel = { fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 400 } as const;
const monoSub = { fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 400 } as const;
const tracked = {
  fontFamily: 'var(--ui)',
  fontSize: 9.5,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
} as const;

export function BlastGraph() {
  return (
    <svg
      viewBox="0 0 1180 300"
      style={{ width: '100%', minWidth: 1000, height: 'auto' }}
      role="img"
      aria-label="Blast radius: one affected version reaching six services through four lockfiles"
    >
      {HEADS.map((head, i) => (
        <text
          key={head}
          x={X[i] - 6}
          y={26}
          fill={C.dim}
          style={{ ...tracked, letterSpacing: '0.11em' }}
        >
          {head}
        </text>
      ))}

      {EDGES.map(([c1, i1, c2, i2], k) => {
        const x1 = X[c1] + 8;
        const y1 = yOf(i1, COLS[c1].length);
        const x2 = X[c2] - 8;
        const y2 = yOf(i2, COLS[c2].length);
        const mx = (x1 + x2) / 2;
        const amber = c2 === 2 && COLS[2][i2].color === C.l1;
        const len = Math.abs(x2 - x1) + Math.abs(y2 - y1) + 40;
        return (
          <path
            key={`e${k}`}
            d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={amber ? 'rgba(245,180,0,.5)' : 'rgba(139,147,167,.28)'}
            strokeWidth={amber ? 1.4 : 1}
            strokeDasharray={len}
            /* settles at offset 0, so a skipped animation still shows the edge */
            style={
              {
                '--len': len,
                animation: `draw .9s var(--ease) ${k * 40}ms both`,
              } as CSSProperties
            }
          />
        );
      })}

      {COLS.flatMap((col, ci) =>
        col.map((node, i) => {
          const y = yOf(i, col.length);
          const x = X[ci];
          if (ci === 3) {
            return (
              <g key={`n${ci}${i}`}>
                <circle cx={x} cy={y} r={3.5} fill={node.c} />
                <text x={x + 12} y={y + 4} fill={C.mut} style={monoLabel}>
                  {node.label}
                </text>
                <text x={x + 12} y={y + 18} fill={node.c} style={tracked}>
                  {node.v}
                </text>
              </g>
            );
          }
          return (
            <g key={`n${ci}${i}`}>
              <rect
                x={x - 6}
                y={y - 6}
                width={12}
                height={12}
                rx={3}
                fill={C.node}
                stroke={node.color}
                strokeWidth={1.2}
              />
              <text x={x + 13} y={y + 1} fill={ci === 0 ? C.fg : C.mut} style={monoLabel}>
                {node.label}
              </text>
              <text x={x + 13} y={y + 15} fill={C.dim} style={monoSub}>
                {node.sub}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
