import type { Incident } from "@/lib/incident";
import { short, svcSlug } from "@/lib/format";
import { EmptySlot, SCROLLER } from "@/components/console/states";
import { LEVEL } from "@/lib/level";
import { cn } from "@/lib/utils";

// Slot-sized empty state (the page-sized one is StateView): 44px muted icon circle → one sentence
// ≤44ch, vertically centred in a 120px slot. Shared by the report's tables, Q5, victims and the
// service detail — never a left-aligned line floating in a box.

// Blast radius — the report's hero. Drawn from the paths HydraDB returned for Q1 (chains
// [bad, REL, …, REL, lockfile] plus the lockfile→service edge), laid out in the four columns of the
// spec: version → dependency → lockfile → service. The dependency column is the one the lockfile
// pulls the version in through (`via`, with its hop count as the sub-label) or the literal
// "direct dependency" node when the lockfile pins the affected version itself. Server-rendered
// SVG, 1180×300 viewBox, no client JS.

type Box = { key: string; label: string; sub: string; stroke: string; title?: string };
type Svc = { key: string; level: string };

const X = [90, 350, 640, 990];
const ROWS = 8; // 232/8 = 29 user units per row — the floor for label + sub-label
const RANK: Record<string, number> = { L2: 3, L1: 2, unscanned: 1, L0: 0 };
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const lockLabel = (key: string) => {
  const [repo, sha = ""] = short(key).split("@");
  return `${repo.split("/").pop()}@${sha.slice(0, 7)}`;
};

export function BlastGraph({ inc }: { inc: Incident }) {
  const rows = inc.q1_exposed.rows;
  const level = (svc: string) => inc.q7_reachability[svc]?.level ?? "unscanned";
  const q3 = inc.q3_while_live;
  const inWindow = new Set((q3?.rows ?? []).filter((r) => r.evidence.includes("in_window")).map((r) => r.lockfile));
  const pinsRemoved = new Set((q3?.rows ?? []).filter((r) => r.evidence.includes("pinned_removed")).map((r) => r.lockfile));

  // Worst verdict first, so the row cap keeps what matters.
  const services = [...new Set(rows.map((r) => r.service))].sort((a, b) => (RANK[level(b)] ?? 0) - (RANK[level(a)] ?? 0) || a.localeCompare(b));

  const bad = new Map<string, Box>();
  const via = new Map<string, Box>();
  const lock = new Map<string, Box>();
  const svc: Svc[] = [];
  const edges = new Set<string>(); // "col|src|dst"
  let shown = 0;
  for (const s of services) {
    const mine = rows.filter((r) => r.service === s);
    const nb = new Set(bad.keys()), nv = new Set(via.keys()), nl = new Set(lock.keys());
    for (const r of mine) {
      nl.add(r.lockfile);
      nv.add(r.via ?? "direct");
      for (const b of r.bad_versions) nb.add(b);
    }
    if (shown > 0 && Math.max(nb.size, nv.size, nl.size, svc.length + 1) > ROWS) break;
    shown++;
    svc.push({ key: s, level: level(s) });
    for (const r of mine) {
      const v = r.via ?? "direct";
      const sub = !q3 ? "resolved" : inWindow.has(r.lockfile) ? "in window" : pinsRemoved.has(r.lockfile) ? "pins removed" : "outside window";
      if (!lock.has(r.lockfile)) lock.set(r.lockfile, { key: r.lockfile, label: trunc(lockLabel(r.lockfile), 30), sub, stroke: inWindow.has(r.lockfile) ? "stroke-l1" : "stroke-unknown", title: short(r.lockfile) });
      if (!via.has(v))
        via.set(v, r.via ? { key: v, label: trunc(short(r.via), 30), sub: `${r.hops} hop${r.hops === 1 ? "" : "s"}`, stroke: "stroke-unknown", title: short(r.via) } : { key: v, label: "direct dependency", sub: "declared", stroke: "stroke-unknown" });
      for (const b of r.bad_versions) {
        if (!bad.has(b)) bad.set(b, { key: b, label: trunc(short(b), 30), sub: "affected", stroke: "stroke-l2", title: short(b) });
        edges.add(`0|${b}|${v}`);
      }
      edges.add(`1|${v}|${r.lockfile}`);
      edges.add(`2|${r.lockfile}|${s}`);
    }
  }
  const cols: string[][] = [[...bad.keys()], [...via.keys()], [...lock.keys()], svc.map((s) => s.key)];
  const yOf = (i: number, n: number) => 46 + (i + 0.5) * (232 / n);
  const pos = new Map<string, number>();
  cols.forEach((c, ci) => c.forEach((k, i) => pos.set(`${ci}|${k}`, yOf(i, c.length))));
  const heads = ["version", "dependency", "lockfile", "service"];

  return (
    <section
      id="graph"
      data-sect="graph"
      aria-label="blast radius"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-linear-to-b from-card to-bg elev"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-[18px] pt-4">
        <span className="label tracking-[0.11em]">blast radius</span>
        <span className="font-mono text-[12px] leading-none text-dim">
          version → dependency → lockfile → service
          {shown < services.length && <span className="num"> · showing {shown} of {services.length} services, worst verdicts first</span>}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptySlot className="min-h-[160px]">no watched service resolves an affected version — nothing to draw</EmptySlot>
      ) : (
        <div className={cn(SCROLLER, "px-2 pt-1")}>
          <svg viewBox="0 0 1180 300" className="h-auto w-full min-w-[1000px]" role="img" aria-label={`blast radius graph: ${shown} services, ${lock.size} lockfiles, ${edges.size} edges`}>
            {heads.map((h, i) => (
              <text key={h} x={X[i] - 6} y={26} className="fill-dim text-[11.5px] font-medium uppercase tracking-[0.11em]">
                {h}
              </text>
            ))}
            {[...edges].map((e) => {
              const [c, a, b] = e.split("|");
              const ci = Number(c);
              const y1 = pos.get(`${ci}|${a}`)!;
              const y2 = pos.get(`${ci + 1}|${b}`)!;
              const x1 = X[ci] + 8;
              const x2 = X[ci + 1] - 8;
              const mx = (x1 + x2) / 2;
              const amber = ci === 1 && inWindow.has(b);
              return (
                <path
                  key={e}
                  d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  className={amber ? "stroke-l1" : "stroke-unknown"}
                  strokeOpacity={amber ? 0.5 : 0.28}
                  strokeWidth={amber ? 1.4 : 1}
                />
              );
            })}
            {[bad, via, lock].map((m, ci) =>
              [...m.values()].map((n) => {
                const y = pos.get(`${ci}|${n.key}`)!;
                const x = X[ci];
                return (
                  <g key={`${ci}|${n.key}`}>
                    {n.title && <title>{n.title}</title>}
                    <rect x={x - 6} y={y - 6} width={12} height={12} rx={3} className={cn("fill-card2", n.stroke)} strokeWidth={1.2} />
                    <text x={x + 13} y={y + 1} className={cn("font-mono text-[12.5px]", ci === 0 ? "fill-fg" : "fill-mut")}>
                      {n.label}
                    </text>
                    <text x={x + 13} y={y + 15} className={cn("font-mono text-[11.5px]", n.sub === "in window" ? "fill-l1" : "fill-dim")}>
                      {n.sub}
                    </text>
                  </g>
                );
              }),
            )}
            {svc.map((s) => {
              const y = pos.get(`3|${s.key}`)!;
              const x = X[3];
              const l = LEVEL[s.level] ?? LEVEL.unscanned;
              const fill = l.dot.replace("bg-", "fill-");
              return (
                <g key={s.key}>
                  <title>{svcSlug(s.key)}</title>
                  <circle cx={x} cy={y} r={3.5} className={fill} />
                  <text x={x + 12} y={y + 4} className="fill-mut font-mono text-[12.5px]">
                    {trunc(svcSlug(s.key), 22)}
                  </text>
                  <text x={x + 12} y={y + 18} className={cn("text-[11.5px] font-medium uppercase tracking-[0.08em]", fill)}>
                    {l.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <ul className="mt-1 flex flex-wrap gap-[18px] border-t border-line px-[18px] pb-4 pt-2 font-mono text-[11.5px] leading-none text-dim" aria-label="legend">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-2 bg-l1" aria-hidden />
          lockfile resolved while installable
        </li>
        {(["L2", "L1", "L0", "unscanned"] as const).map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block size-1.5 rounded-full", LEVEL[k].dot)} aria-hidden />
            {LEVEL[k].label}
          </li>
        ))}
      </ul>
    </section>
  );
}
