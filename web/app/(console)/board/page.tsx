import { listIncidents, short, svcSlug, fmtUtc } from "@/lib/incident";
import { KanbanSquare } from "lucide-react";
import { Lane } from "./lane";

export const dynamic = "force-static";

// Triage board: every (service, incident) exposure as a card, in the column of its state.
// States are computed, not assigned — a card moves when the data moves.
type Card = {
  service: string;
  advisory: string;
  kind: string;
  level: string;
  whileLive: boolean;
  evidence?: string;
  lockfiles: number;
  latestSha: string;
  latestAt: number;
  via: string | null;
  hops: number;
};

// Lane colours are verdict colours at 100% (2px top rule + count), never alpha tints.
const COLUMNS: { key: string; title: string; hint: string; tone: { border: string; text: string } }[] = [
  { key: "act", title: "Act now", hint: "L2 — vulnerable symbol referenced", tone: { border: "border-t-l2", text: "text-l2" } },
  { key: "live", title: "Resolved while live", hint: "lockfile written inside the window", tone: { border: "border-t-l1", text: "text-l1" } },
  { key: "imported", title: "Imported", hint: "L1 — code path reaches the package", tone: { border: "border-t-l1", text: "text-l1" } },
  { key: "unscanned", title: "Unscanned", hint: "exposed; source not read — never assumed safe", tone: { border: "border-t-unknown", text: "text-unknown" } },
  { key: "present", title: "Present only", hint: "L0 — in the tree, never imported", tone: { border: "border-t-l0", text: "text-l0" } },
];

function stateOf(c: Card): string {
  if (c.level === "L2") return "act";
  if (c.whileLive) return "live";
  if (c.level === "L1") return "imported";
  if (c.level === "unscanned") return "unscanned";
  return "present";
}

export default async function Board() {
  const incidents = await listIncidents();
  const cards: Card[] = [];
  for (const inc of incidents) {
    const bySvc = new Map<string, typeof inc.q1_exposed.rows>();
    for (const r of inc.q1_exposed.rows) bySvc.set(r.service, [...(bySvc.get(r.service) ?? []), r]);
    const liveSvcs = new Map<string, string>();
    for (const r of inc.q3_while_live?.rows ?? []) liveSvcs.set(r.service, r.evidence);
    for (const [svc, rows] of bySvc) {
      const latest = rows[0];
      cards.push({
        service: svc,
        advisory: inc.advisory.key,
        kind: inc.advisory.kind,
        level: inc.q7_reachability[svc]?.level ?? "unscanned",
        whileLive: liveSvcs.has(svc),
        evidence: liveSvcs.get(svc),
        lockfiles: rows.length,
        latestSha: latest.sha,
        latestAt: latest.committed_at,
        via: latest.via,
        hops: latest.hops,
      });
    }
  }
  const byState = new Map<string, Card[]>(COLUMNS.map((c) => [c.key, []]));
  for (const c of cards) byState.get(stateOf(c))!.push(c);
  for (const list of byState.values()) list.sort((a, b) => b.latestAt - a.latestAt);

  return (
    <div className="group px-10 py-9 pb-[72px] max-[900px]:px-5">
      <div className="mx-auto mb-[22px] flex max-w-[1600px] flex-wrap items-baseline justify-between gap-5">
        <div>
          <h1 className="text-balance text-[22px] font-medium leading-[1.25] tracking-[-0.015em] text-fg">Remediation board</h1>
          <p className="mt-2 text-pretty text-[12.5px] text-mut">
            Every exposed service across the <span className="num">{incidents.length}</span> composed incident{incidents.length === 1 ? "" : "s"}, by what it needs.{" "}
            <span className="num">{cards.length}</span> exposure{cards.length === 1 ? "" : "s"} · states are computed from the graph, not assigned.
          </p>
        </div>
        {/* Density switch: a native checkbox drives `group-has-[:checked]` on the lanes — no client JS. */}
        <label className="inline-flex min-h-10 cursor-pointer select-none items-center rounded-lg border border-border px-[13px] text-[11.5px] font-medium leading-none text-mut transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg has-[:checked]:bg-hover has-[:checked]:text-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal/50">
          <input type="checkbox" role="switch" className="sr-only" />
          compact cards
        </label>
      </div>
      {cards.length === 0 && (
        <div className="elev mx-auto mb-5 flex max-w-[1600px] flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-card2 text-mut">
            <KanbanSquare className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-pretty text-[13px] text-mut">No incidents composed yet — cards appear once an advisory is run against the graph.</p>
        </div>
      )}
      <div className="mx-auto flex max-w-[1600px] gap-3.5 overflow-x-auto overscroll-x-contain pb-2">
        {COLUMNS.map((col) => (
          <Lane
            key={col.key}
            title={col.title}
            hint={col.hint}
            tone={col.tone}
            wide={col.key === "present"}
            cards={byState.get(col.key)!.map((c) => ({
              href: `/incident/${c.advisory}/${svcSlug(c.service)}`,
              slug: svcSlug(c.service),
              advisory: c.advisory,
              level: c.level,
              whileLive: c.whileLive,
              via: c.via ? `${short(c.via)} · ${c.hops} hop${c.hops === 1 ? "" : "s"}` : "direct",
              sha: c.latestSha.slice(0, 7),
              time: fmtUtc(new Date(c.latestAt * 1000).toISOString()),
              lockfiles: c.lockfiles,
            }))}
          />
        ))}
      </div>
    </div>
  );
}
