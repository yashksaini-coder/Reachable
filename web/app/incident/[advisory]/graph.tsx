import type { ReactNode } from "react";
import { short, svcSlug, type Incident } from "@/lib/incident";
import { cn } from "@/lib/utils";
import { ELEV } from "@/app/ui";

// Blast radius, drawn from the JSON paths HydraDB returned (algo.SPpaths chains + the
// lockfile→service edge). Layered left→right: affected versions · intermediate dependency
// versions · lockfiles · services. Server-rendered SVG, no client JS, no layout library — a
// barycenter pass is enough to keep the crossings down at this size.

type Kind = "bad" | "dep" | "lock" | "svc";
type Node = { key: string; kind: Kind; layer: number; tone: string; y: number };

const RANK: Record<string, number> = { L2: 3, L1: 2, unscanned: 1, L0: 0 };
const LEVEL_TONE: Record<string, string> = { L2: "var(--color-l2)", L1: "var(--color-l1)", L0: "var(--color-l0)", unscanned: "var(--color-unknown)" };
const GREY = "var(--color-muted-foreground)";
const CAP = 60;

export function BlastGraph({ inc }: { inc: Incident }) {
  const rows = inc.q1_exposed.rows;
  if (rows.length === 0) return null;
  const level = (svc: string) => inc.q7_reachability[svc]?.level ?? "unscanned";
  const inWindow = new Set((inc.q3_while_live?.rows ?? []).map((r) => r.lockfile));

  // Worst verdict first, so the cap keeps what matters.
  const services = [...new Set(rows.map((r) => r.service))].sort((a, b) => (RANK[level(b)] ?? 0) - (RANK[level(a)] ?? 0) || a.localeCompare(b));

  const nodes = new Map<string, Node>();
  const edges = new Set<string>(); // "src|dst"
  const add = (key: string, kind: Kind, layer: number, tone: string) => {
    const n = nodes.get(key);
    if (n) n.layer = Math.max(n.layer, layer);
    else nodes.set(key, { key, kind, layer, tone, y: 0 });
  };
  const link = (a: string, b: string) => edges.add(`${a}|${b}`);

  // Every chain in the JSON: [bad, REL, ver, REL, ..., REL, lock]; keys sit at even indices.
  const chainsOf = (r: (typeof rows)[number]) =>
    r.paths.length ? r.paths.map((p) => p.chain) : r.bad_versions.map((b) => [b, "RESOLVED", r.lockfile]);
  const keysOf = (chain: string[]) => chain.filter((_, i) => i % 2 === 0);

  let shown = 0;
  for (const svc of services) {
    const mine = rows.filter((r) => r.service === svc);
    const need = new Set<string>([svc]);
    for (const r of mine) for (const c of chainsOf(r)) for (const k of keysOf(c)) need.add(k);
    const fresh = [...need].filter((k) => !nodes.has(k)).length;
    if (nodes.size > 0 && nodes.size + fresh > CAP) break;
    shown++;
    add(svc, "svc", 0, LEVEL_TONE[level(svc)] ?? GREY);
    for (const r of mine) {
      add(r.lockfile, "lock", 0, inWindow.has(r.lockfile) ? "var(--color-l1)" : GREY);
      link(r.lockfile, svc);
      for (const c of chainsOf(r)) {
        const keys = keysOf(c);
        keys.forEach((k, i) => {
          if (i === 0) add(k, "bad", 0, "var(--color-l2)");
          else if (i < keys.length - 1) add(k, "dep", i, GREY);
          if (i > 0) link(keys[i - 1], k);
        });
      }
    }
  }
  // Lockfiles sit after the deepest dependency; services one column further.
  const depMax = Math.max(0, ...[...nodes.values()].filter((n) => n.kind === "dep").map((n) => n.layer));
  for (const n of nodes.values()) {
    if (n.kind === "lock") n.layer = depMax + 1;
    if (n.kind === "svc") n.layer = depMax + 2;
  }
  const L = depMax + 3;
  const layers: Node[][] = Array.from({ length: L }, () => []);
  for (const n of nodes.values()) layers[n.layer].push(n);
  for (const l of layers) l.sort((a, b) => a.key.localeCompare(b.key));

  // Barycenter ordering: forward pass then backward pass.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = e.split("|");
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  const pos = new Map<string, number>();
  const index = () => layers.forEach((l) => l.forEach((n, i) => pos.set(n.key, i)));
  const sweep = (order: number[]) => {
    for (const li of order) {
      const ref = layers[li + (order[0] === 0 ? -1 : 1)];
      if (!ref) continue;
      const refKeys = new Set(ref.map((n) => n.key));
      const bary = (n: Node) => {
        const nb = (adj.get(n.key) ?? []).filter((k) => refKeys.has(k)).map((k) => pos.get(k)!);
        return nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : pos.get(n.key)!;
      };
      layers[li].sort((a, b) => bary(a) - bary(b));
      index();
    }
  };
  index();
  sweep([...layers.keys()]); // forward: layer 1..L-1 against left neighbour
  sweep([...layers.keys()].reverse()); // backward: L-2..0 against right neighbour

  const rowH = 26;
  const colW = 210;
  const padX = 12;
  const H = Math.max(...layers.map((l) => l.length)) * rowH + 24;
  const W = L * colW;
  for (const l of layers) {
    const off = (H - l.length * rowH) / 2 + rowH / 2;
    l.forEach((n, i) => (n.y = off + i * rowH));
  }
  const x = (n: Node) => padX + n.layer * colW;
  const heads = ["affected version", ...Array.from({ length: depMax }, (_, i) => `dependent · ${i + 1} hop${i ? "s" : ""}`), "lockfile", "service"];
  const label = (n: Node) => {
    const s = n.kind === "svc" ? svcSlug(n.key) : n.kind === "lock" ? short(n.key).replace(/^.*@/, "@").slice(0, 13) : short(n.key);
    return s.length > 26 ? s.slice(0, 25) + "…" : s;
  };

  return (
    <section className={cn("rounded-lg border border-border bg-card/70 p-3", ELEV)} aria-label="blast radius">
      <div className="mb-1 flex flex-wrap justify-between gap-x-4 font-mono text-[10px] text-muted-foreground">
        <span>blast radius · from the paths HydraDB returned</span>
        <span className="num">
          {nodes.size} nodes · {edges.size} edges
          {shown < services.length && ` · showing ${shown} of ${services.length} services (worst verdicts first)`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="max-w-none"
          role="img"
          aria-label={`blast radius graph: ${nodes.size} nodes, ${edges.size} edges, ${shown} services`}
        >
          {heads.map((h, i) => (
            <text key={i} x={padX + i * colW} y={11} fill={GREY} fontSize="9" fontFamily="ui-monospace, monospace" letterSpacing="0.1em">
              {h.toUpperCase()}
            </text>
          ))}
          {[...edges].map((e) => {
            const [a, b] = e.split("|");
            const s = nodes.get(a)!;
            const t = nodes.get(b)!;
            const x1 = x(s) + 6;
            const x2 = x(t) - 6;
            const mx = (x1 + x2) / 2;
            return <path key={e} d={`M${x1},${s.y} C${mx},${s.y} ${mx},${t.y} ${x2},${t.y}`} fill="none" stroke={t.tone} strokeOpacity={0.4} strokeWidth={1.25} />;
          })}
          {[...nodes.values()].map((n) => (
            <g key={n.key}>
              <title>{n.key}</title>
              {n.kind === "svc" ? (
                <rect x={x(n) - 5} y={n.y - 5} width={10} height={10} rx={2} fill={n.tone} />
              ) : (
                <circle cx={x(n)} cy={n.y} r={n.kind === "bad" ? 5 : 4} fill={n.tone} />
              )}
              <text
                x={x(n) + 10}
                y={n.y + 3.5}
                fill="var(--color-foreground)"
                fontSize="10.5"
                fontFamily="ui-monospace, monospace"
                paintOrder="stroke"
                stroke="var(--color-card)"
                strokeWidth={4}
                strokeLinejoin="round"
              >
                {label(n)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground" aria-label="legend">
        <Key swatch={<span className="block size-2.5 rounded-full bg-l2" />}>affected version</Key>
        <Key swatch={<span className="block size-2 rounded-full bg-muted-foreground" />}>dependency / lockfile</Key>
        <Key swatch={<span className="block size-2 rounded-full bg-l1" />}>lockfile committed while live</Key>
        <Key
          swatch={
            <span className="flex gap-0.5">
              <span className="block size-2 rounded-[2px] bg-l2" />
              <span className="block size-2 rounded-[2px] bg-l1" />
              <span className="block size-2 rounded-[2px] bg-l0" />
              <span className="block size-2 rounded-[2px] bg-unknown" />
            </span>
          }
        >
          service · verdict L2 / L1 / L0 / unscanned
        </Key>
      </ul>
    </section>
  );
}

function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center justify-center" aria-hidden>
        {swatch}
      </span>
      {children}
    </li>
  );
}
