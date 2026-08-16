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

const COLUMNS: { key: string; title: string; hint: string; tone: string }[] = [
  { key: "act", title: "Act now", hint: "L2 — vulnerable symbol referenced", tone: "border-l2/50" },
  { key: "live", title: "Resolved while live", hint: "lockfile pinned the artifact while it was installable", tone: "border-l1/50" },
  { key: "imported", title: "Imported", hint: "L1 — package imported by first-party code", tone: "border-l1/30" },
  { key: "unscanned", title: "Unscanned", hint: "exposed; source not read — never assumed safe", tone: "border-unknown/40" },
  { key: "present", title: "Present only", hint: "L0 — in the tree, never imported", tone: "border-l0/40" },
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance">Triage board</h1>
        <span className="text-[13px] text-muted-foreground text-pretty">
          <span className="num">{cards.length}</span> exposures across <span className="num">{incidents.length}</span> incident{incidents.length === 1 ? "" : "s"} · states are computed from the graph, not assigned
        </span>
      </header>
      {cards.length === 0 && (
        <div className="elev flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <KanbanSquare className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-[13px] text-muted-foreground text-pretty">No incidents composed yet — cards appear once an advisory is run against the graph.</p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col, i) => (
          <Lane
            key={col.key}
            index={i}
            title={col.title}
            hint={col.hint}
            tone={col.tone}
            cards={byState.get(col.key)!.map((c) => ({
              href: `/incident/${c.advisory}/${svcSlug(c.service)}`,
              slug: svcSlug(c.service),
              advisory: c.advisory,
              level: c.level,
              whileLive: c.whileLive,
              meta: `${c.latestSha.slice(0, 10)} · ${fmtUtc(new Date(c.latestAt * 1000).toISOString())}${c.via ? ` · via ${short(c.via)}` : " · direct"} · ${c.lockfiles} lockfile${c.lockfiles === 1 ? "" : "s"}`,
            }))}
          />
        ))}
      </div>
    </div>
  );
}
