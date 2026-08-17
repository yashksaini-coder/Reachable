import { Box, Edge, Note, Svg } from "./_shared";

// Q4 — maintainer fan-out: the bad package's maintainers, what else they maintain, and which
// watched services resolve those packages today. Names are from the report; the fan is capped.
const PKGS = [
  { y: 66, label: "color-convert", from: "qix" },
  { y: 118, label: "is-arrayish", from: "qix" },
  { y: 186, label: "agent-base", from: "tootallnate" },
  { y: 238, label: "https-proxy-agent", from: "tootallnate" },
  { y: 290, label: "util-deprecate", from: "tootallnate" },
] as const;
const M = { qix: 92, tootallnate: 238 } as const;
const SVCS = [
  { y: 92, label: "Kong/insomnia" },
  { y: 152, label: "koajs/koa" },
  { y: 212, label: "twbs/bootstrap" },
  { y: 272, label: "medplum/medplum" },
];
// package index → services it resolves into (subset of the report's services_at_risk)
const RESOLVES: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 3], [2, 0], [2, 2], [3, 3], [4, 1], [4, 2]];

export default function Q4Fanout() {
  const id = "q4";
  const [xBad, xM, xP, xS] = [95, 300, 530, 775];
  return (
    <Svg id={id} title="Q4 fan-out: debug is maintained by qix and tootallnate; they also maintain color-convert, is-arrayish, agent-base, https-proxy-agent and util-deprecate; watched services such as Kong/insomnia and koajs/koa resolve those packages today" h={380}>
      <Box cx={xBad} cy={165} w={130} kind="Package" label="debug" stroke="stroke-signal" dot="fill-l2" />
      <Box cx={xM} cy={M.qix} w={130} kind="Maintainer" label="qix" />
      <Box cx={xM} cy={M.tootallnate} w={130} kind="Maintainer" label="tootallnate" />
      {/* MAINTAINS into the bad package */}
      <Edge id={id} d={`M ${xM - 65} ${M.qix} L ${xBad + 66} 158`} tone="signal" />
      <Edge id={id} d={`M ${xM - 65} ${M.tootallnate} L ${xBad + 66} 172`} tone="signal" label="MAINTAINS" lx={200} ly={190} />

      {PKGS.map((p) => (
        <g key={p.label}>
          <Edge id={id} d={`M ${xM + 65} ${M[p.from]} L ${xP - 71} ${p.y}`} tone="signal" />
          <Box cx={xP} cy={p.y} w={140} h={32} label={p.label} />
        </g>
      ))}
      <text x={xP} y={26} textAnchor="middle" className="fill-dim text-[9.5px] uppercase tracking-[0.08em]">also maintains · Package</text>

      {RESOLVES.map(([pi, si]) => (
        <Edge key={`${pi}-${si}`} id={id} d={`M ${xP + 70} ${PKGS[pi].y} L ${xS - 81} ${SVCS[si].y}`} tone="input" />
      ))}
      {SVCS.map((s) => (
        <Box key={s.label} cx={xS} cy={s.y} w={160} h={32} label={s.label} />
      ))}
      <text x={xS} y={26} textAnchor="middle" className="fill-dim text-[9.5px] uppercase tracking-[0.08em]">resolves it today · Service</text>
      <text x={xS - 81 - 4} y={44} textAnchor="end" className="fill-dim font-mono text-[10px]">RESOLVED ← VERSION_OF</text>

      <Note x={40} y={326}>32 co-maintained packages · top 8 by downloads computed · rest not computed — one RESOLVED query per package, so the fan is capped on purpose.</Note>
      <Note x={40} y={344}>“services at risk” = exposure if that package is compromised next, not exposure to this incident.</Note>
      <Note x={40} y={362}>twofa / account_created are not exposed by the public registry — shown as unknown, never guessed.</Note>
    </Svg>
  );
}
