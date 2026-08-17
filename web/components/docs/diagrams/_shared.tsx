import type { ReactNode } from "react";

// Literal class names so Tailwind sees them (no interpolated utilities).
export type Tone = "input" | "signal" | "signal2" | "l1" | "mut" | "fg";
const FILL: Record<Tone, string> = { input: "fill-input", signal: "fill-signal", signal2: "fill-signal-2", l1: "fill-l1", mut: "fill-mut", fg: "fill-fg" };
const STROKE: Record<Tone, string> = { input: "stroke-input", signal: "stroke-signal", signal2: "stroke-signal-2", l1: "stroke-l1", mut: "stroke-mut", fg: "stroke-fg" };

// Shared primitives for the guide diagrams. Server components, inline SVG, design tokens only:
// boxes are fill-card2/stroke-border, quiet edges stroke-input, highlighted walks stroke-signal.

export function Svg({ id, title, h, w = 900, children }: { id: string; title: string; h: number; w?: number; children: ReactNode }) {
  return (
    <svg role="img" viewBox={`0 0 ${w} ${h}`} className="block w-full min-w-[760px]" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>{title}</title>
      <defs>
        {(Object.keys(FILL) as Tone[]).map((c) => (
          <marker key={c} id={`${id}-${c}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5 L7 4 L0 7.5 z" className={FILL[c]} />
          </marker>
        ))}
      </defs>
      {children}
    </svg>
  );
}

// A node box: kind (10px dim, upper-case) over key (11px mono fg). Centre-anchored at (cx, cy).
export function Box({ cx, cy, w = 150, h = 38, kind, label, stroke = "stroke-border", dot }: {
  cx: number; cy: number; w?: number; h?: number; kind?: string; label: string; stroke?: string; dot?: string;
}) {
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={4} className={`fill-card2 ${stroke}`} strokeWidth={stroke === "stroke-border" ? 1 : 1.4} />
      {kind && (
        <text x={cx} y={cy - 7} textAnchor="middle" className="fill-dim text-[11.5px] uppercase tracking-[0.08em]">{kind}</text>
      )}
      <text x={cx} y={kind ? cy + 9 : cy + 4} textAnchor="middle" className="fill-fg font-mono text-[13px]">{label}</text>
      {dot && <circle cx={cx + w / 2 - 9} cy={cy - h / 2 + 9} r={3.5} className={dot} />}
    </g>
  );
}

// An edge path with an arrowhead. `tone` picks stroke + marker; label sits at (lx, ly).
export function Edge({ id, d, tone = "input", dashed, label, lx, ly, anchor = "middle", labelTone }: {
  id: string; d: string; tone?: Tone; dashed?: boolean; label?: string; lx?: number; ly?: number;
  anchor?: "start" | "middle" | "end"; labelTone?: string;
}) {
  return (
    <g>
      <path d={d} fill="none" className={STROKE[tone]} strokeWidth={tone === "input" ? 1 : 1.4} strokeDasharray={dashed ? "4 3" : undefined} markerEnd={`url(#${id}-${tone})`} />
      {label && (
        <text x={lx} y={ly} textAnchor={anchor} className={`font-mono text-[12.5px] ${labelTone ?? (tone === "input" ? "fill-dim" : FILL[tone])}`}>{label}</text>
      )}
    </g>
  );
}

export function Note({ x, y, children, anchor = "start", tone = "fill-dim" }: { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end"; tone?: string }) {
  return <text x={x} y={y} textAnchor={anchor} className={`text-[13px] ${tone}`}>{children}</text>;
}

// Numbered walk badge (Q1..Q6): a small ring in the walk's tone.
export function Badge({ x, y, n, tone }: { x: number; y: number; n: number; tone: Tone }) {
  return (
    <g>
      <circle cx={x} cy={y} r={10} className={`fill-card2 ${STROKE[tone]}`} strokeWidth={1.4} />
      <text x={x} y={y + 3.5} textAnchor="middle" className={`font-mono text-[11px] ${FILL[tone]}`}>Q{n}</text>
    </g>
  );
}
