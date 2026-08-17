import { Box, Edge, Note, Svg } from "./_shared";

// Q5 — near names: NAME_SIMILAR_TO edges are materialised at ingest (suspect → popular), so
// proximity is a traversal. The two scope neighbours are the report's real rows; the one-edit
// examples show the other kinds the ingest computes.
export default function Q5NearNames() {
  const id = "q5";
  const C = { x: 450, y: 170 };
  const near = [
    { x: 150, y: 90, label: "@types/debug", kind: "scope", d: 1, real: true },
    { x: 150, y: 250, label: "@prisma/debug", kind: "scope", d: 1, real: true },
  ];
  const kinds = [
    { y: 70, kind: "hyphen", ex: "de-bug" },
    { y: 120, kind: "deletion", ex: "debg" },
    { y: 170, kind: "transposition", ex: "dbeug" },
    { y: 220, kind: "substitution", ex: "debuq" },
    { y: 270, kind: "homoglyph", ex: "debµg" },
  ];
  return (
    <Svg id={id} title="Q5 near names: the package debug in the centre; @types/debug and @prisma/debug are one scope-edit away in the graph; the ingest also materialises hyphen, deletion, transposition, substitution and homoglyph neighbours when such packages exist" h={340}>
      <Box cx={C.x} cy={C.y} w={150} h={44} kind="Package · popular" label="debug" stroke="stroke-signal" />

      {near.map((n) => (
        <g key={n.label}>
          <Box cx={n.x} cy={n.y} w={150} h={38} kind="Package · suspect" label={n.label} />
          <Edge id={id} d={`M ${n.x + 75} ${n.y} L ${C.x - 76} ${C.y + (n.y < C.y ? -12 : 12)}`} tone="signal" />
          <rect x={n.x + 96} y={n.y - 32 + (n.y < C.y ? 0 : 52)} width={78} height={16} rx={4} className="fill-card2 stroke-border" strokeWidth={1} />
          <text x={n.x + 135} y={n.y - 21 + (n.y < C.y ? 0 : 52)} textAnchor="middle" className="fill-mut font-mono text-[10.5px]">{n.kind} · d={n.d}</text>
        </g>
      ))}
      <text x={290} y={C.y - 4} textAnchor="middle" className="fill-signal font-mono text-[11px]">NAME_SIMILAR_TO</text>
      <text x={290} y={C.y + 9} textAnchor="middle" className="fill-dim font-mono text-[11px]">{"{kind, distance}"}</text>
      <text x={290} y={C.y + 22} textAnchor="middle" className="fill-dim font-mono text-[11px]">suspect → popular</text>

      {/* the other kinds the ingest materialises when a package with that name exists */}
      <text x={720} y={40} textAnchor="middle" className="fill-dim text-[10.5px] uppercase tracking-[0.08em]">one-edit kinds · examples</text>
      {kinds.map((k) => (
        <g key={k.kind}>
          <Edge id={id} d={`M ${C.x + 76} ${C.y} L 640 ${k.y}`} tone="input" dashed />
          <rect x={640} y={k.y - 12} width={72} height={20} rx={4} className="fill-card2 stroke-border" strokeWidth={1} />
          <text x={676} y={k.y + 2} textAnchor="middle" className="fill-mut font-mono text-[10.5px]">{k.kind}</text>
          <text x={724} y={k.y + 2} className="fill-dim font-mono text-[11.5px]">{k.ex}</text>
        </g>
      ))}

      <Note x={40} y={312}>Materialised at ingest: the query is a one-hop MATCH with WHERE sim.distance ≤ $maxd — no name scan at request time.</Note>
      <Note x={40} y={330}>distance and kind are facts; “typosquat” is a hypothesis. The corpus is the ingested graph, so neighbours may be legitimate look-alikes.</Note>
    </Svg>
  );
}
