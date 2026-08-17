import { Box, Edge, Note, Svg } from "./_shared";

// Ingest pipeline: four public sources → four worker stages → the node labels they write.
// No counts here on purpose — the numbers live in prose, read from the report at build time.
const SRC = [
  { y: 70, label: "GitHub", sub: "lockfile history · npm v2/v3 · pnpm v6/v9", to: [0] },
  { y: 150, label: "npm registry", sub: "versions · maintainers · time map", to: [1] },
  { y: 230, label: "api.npmjs.org", sub: "weekly downloads", to: [1] },
  { y: 310, label: "OSV", sub: "advisories · affected ranges", to: [2] },
];
const STAGE = [
  { y: 70, label: "lockfiles", sub: "flatten each snapshot's install tree" },
  { y: 150, label: "packages", sub: "enrich · name similarity" },
  { y: 230, label: "advisories", sub: "AFFECTS window per version" },
  { y: 310, label: "reach", sub: "import scan at the exposed commit" },
];
const OUT = [
  { labels: "Service · Lockfile · Version", edges: "HAS_LOCKFILE · RESOLVED · DEPENDS_ON" },
  { labels: "Package · Version · Maintainer", edges: "VERSION_OF · MAINTAINS · NAME_SIMILAR_TO" },
  { labels: "Advisory", edges: "AFFECTS {live_from, live_to}" },
  { labels: "File", edges: "CONTAINS · IMPORTS {line}" },
];

export default function Pipeline() {
  const id = "pipe";
  const [xS, xW, xO] = [120, 400, 700];
  return (
    <Svg id={id} title="Ingest pipeline: GitHub lockfile history, the npm registry, api.npmjs.org downloads and OSV advisories feed the worker stages lockfiles, packages, advisories and reach, which write the HydraDB node labels and relationships" h={400}>
      <text x={xS} y={30} textAnchor="middle" className="fill-dim text-[9.5px] uppercase tracking-[0.08em]">sources</text>
      <text x={xW} y={30} textAnchor="middle" className="fill-dim text-[9.5px] uppercase tracking-[0.08em]">worker stages</text>
      <text x={xO} y={30} textAnchor="middle" className="fill-dim text-[9.5px] uppercase tracking-[0.08em]">HydraDB · labels written</text>

      {SRC.map((s) => (
        <g key={s.label}>
          <Box cx={xS} cy={s.y} w={170} h={44} label={s.label} />
          <text x={xS} y={s.y + 34} textAnchor="middle" className="fill-dim text-[9.5px]">{s.sub}</text>
          {s.to.map((t) => (
            <Edge key={t} id={id} d={`M ${xS + 85} ${s.y} L ${xW - 76} ${STAGE[t].y}`} tone="input" />
          ))}
        </g>
      ))}
      {/* reach also reads first-party JS/TS from GitHub at the exposed commit */}
      <Edge id={id} d={`M ${xS + 85} ${SRC[0].y + 8} L ${xW - 76} ${STAGE[3].y - 6}`} tone="input" dashed />

      {STAGE.map((s, i) => (
        <g key={s.label}>
          <Box cx={xW} cy={s.y} w={150} h={44} label={s.label} stroke="stroke-signal" />
          <text x={xW} y={s.y + 34} textAnchor="middle" className="fill-dim text-[9.5px]">{s.sub}</text>
          <Edge id={id} d={`M ${xW + 75} ${s.y} H ${xO - 116}`} tone="signal" />
          <rect x={xO - 115} y={s.y - 22} width={230} height={44} rx={4} className="fill-card2 stroke-border" strokeWidth={1} />
          <text x={xO} y={s.y - 3} textAnchor="middle" className="fill-fg font-mono text-[11px]">{OUT[i].labels}</text>
          <text x={xO} y={s.y + 12} textAnchor="middle" className="fill-signal-2 font-mono text-[9.5px]">{OUT[i].edges}</text>
        </g>
      ))}

      <Note x={40} y={368}>All writes are UNWIND $rows batches of 1000 (engine cap 1024) with MERGE on integer id; every timestamp is coerced to int at the source boundary.</Note>
      <Note x={40} y={386}>The reach stage reads first-party JS/TS from GitHub at the exposed commit (dashed) — regex import scan, L0/L1 only.</Note>
    </Svg>
  );
}
