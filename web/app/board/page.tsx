import Link from "next/link";
import { listIncidents, short, svcSlug, fmtUtc } from "@/lib/incident";
import { Chip, Level } from "@/app/ui";

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
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Triage board</h1>
        <span className="text-[13px] text-muted-foreground">
          {cards.length} exposures across {incidents.length} incident{incidents.length === 1 ? "" : "s"} · states are computed from the graph, not assigned
        </span>
      </header>
      {cards.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-5 py-8 text-center text-[13px] text-muted-foreground">No incidents composed yet.</div>
      )}
      <div className="grid gap-3 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const list = byState.get(col.key)!;
          return (
            <section key={col.key} className={`rounded-lg border border-border border-t-2 bg-card ${col.tone} p-2`}>
              <div className="flex items-baseline justify-between px-1 pb-2">
                <div>
                  <div className="text-[13px] font-medium">{col.title}</div>
                  <div className="text-[10.5px] text-muted-foreground">{col.hint}</div>
                </div>
                <div className="num text-lg text-muted-foreground">{list.length}</div>
              </div>
              <div className="space-y-2">
                {list.map((c) => (
                  <Link
                    key={`${c.advisory}:${c.service}`}
                    href={`/incident/${c.advisory}/${svcSlug(c.service)}`}
                    className="block rounded-md border border-border bg-background/70 px-3 py-2 transition-colors hover:border-signal/50"
                  >
                    <div className="truncate font-mono text-[12.5px]">{svcSlug(c.service)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Level level={c.level} />
                      {c.whileLive && <Chip tone="border-l1/40 text-l1">while live</Chip>}
                      <Chip>{c.advisory}</Chip>
                    </div>
                    <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">
                      {c.latestSha.slice(0, 10)} · {fmtUtc(new Date(c.latestAt * 1000).toISOString())}
                      {c.via ? ` · via ${short(c.via)}` : " · direct"} · {c.lockfiles} lockfile{c.lockfiles === 1 ? "" : "s"}
                    </div>
                  </Link>
                ))}
                {list.length === 0 && <div className="px-1 py-4 text-center text-[11px] text-muted-foreground">—</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
