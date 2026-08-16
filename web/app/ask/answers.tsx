import { cn } from "@/lib/utils";
import { Chip, HydraCard, Limits } from "@/app/ui";
import { short, svcSlug, fmtMs, fmtUtc } from "@/lib/format";
import type { Ask } from "@/lib/ask";


export type Row = Record<string, unknown>;
export type AskData = { rows?: Row[]; meta?: Record<string, unknown>; cypher?: string[]; ms?: number; total_ms?: number; limitations?: string[] } & Record<
  string,
  unknown
>;

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const list = (xs: string[], max = 6) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`);
const fmtEpoch = (s: unknown) => (s == null ? "—" : new Date(Number(s) * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z"));

export function sentence(ask: Ask, data: AskData): string {
  const rows = data.rows ?? [];
  const services = uniq(rows.map((r) => svcSlug(String(r.service ?? ""))).filter(Boolean));
  if (rows.length === 0) {
    switch (ask.kind) {
      case "exposed":
        return ask.service ? `${ask.service} never resolved a version affected by ${ask.advisory}.` : `No watched service resolved a version affected by ${ask.advisory}.`;
      case "pulls":
        return `${ask.service} does not resolve ${ask.package} in any ingested lockfile.`;
      case "while-live":
        return `No watched service resolved ${ask.advisory} inside its live window.`;
      case "depends":
        return `No watched lockfile pins ${ask.package}@${ask.version}.`;
      case "versions":
        return `${ask.advisory} has no affected versions in the graph.`;
      case "maintainers":
        return `No co-maintained packages found for ${ask.advisory}.`;
      case "typosquats":
        return `No package name sits within one edit of ${ask.package}.`;
      case "cypher":
        return "0 rows.";
    }
  }
  switch (ask.kind) {
    case "exposed":
      return ask.service
        ? `${ask.service} resolved a version affected by ${ask.advisory} in ${plural(rows.length, "lockfile")}.`
        : `${plural(services.length, "service")} resolved a version affected by ${ask.advisory}: ${list(services)}.`;
    case "depends":
      return `${plural(services.length, "service")} depend on ${ask.package}@${ask.version}: ${list(services)}.`;
    case "pulls": {
      const paths = rows.reduce((n, r) => n + ((r.paths as unknown[] | undefined)?.length ?? 0), 0);
      const vias = uniq(rows.flatMap((r) => ((r.paths as { chain: string[] }[] | undefined) ?? []).map((p) => p.chain[2] ?? "").filter(Boolean)));
      return `${ask.package} reaches ${ask.service} in ${plural(rows.length, "lockfile")} via ${plural(paths, "path")}${vias.length ? `, first through ${list(vias.map(short), 4)}` : " (direct dependency)"}.`;
    }
    case "while-live":
      return `${plural(services.length, "service")} resolved ${ask.advisory} while it was live: ${list(services)}.`;
    case "versions": {
      const removed = rows.filter((r) => r.removed).length;
      return `${ask.advisory} affects ${plural(rows.length, "version")}${removed ? `, ${removed} since removed from the registry` : ""}; earliest ${short(String(rows[0]?.version))}.`;
    }
    case "maintainers": {
      const at = rows.filter((r) => ((r.services_at_risk as string[] | undefined) ?? []).length > 0).length;
      const m = (data.meta?.maintainers as unknown[] | undefined)?.length ?? 0;
      return `${plural(m, "maintainer")} co-maintain ${plural(rows.length, "other package")}, ${at} of them resolved by watched services.`;
    }
    case "typosquats":
      return `${plural(rows.length, "name")} sit one edit away from ${ask.package}: ${list(rows.map((r) => short(String(r.package))))}.`;
    case "cypher":
      return `${plural(rows.length, "row")}, ${Object.keys(rows[0]).length} columns.`;
  }
}

// Row hover + sticky first column (the identifying cell stays put when the table scrolls sideways).
const TABLE =
  "w-full text-[13px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:whitespace-nowrap [&_td]:transition-colors [&_tbody_tr:hover_td]:bg-accent/40 [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:bg-card [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-card [&_tbody_tr:hover_td:first-child]:bg-accent";


export function Answer({ ask, data }: { ask: Ask; data: AskData }) {
  const rows = (data.rows ?? []) as Row[];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
        <Chip tone="mr-2 border-l0/40 text-l0">none</Chip>
        Nothing in the graph matches. For an advisory this means no watched service resolved an affected version; for a package it means no watched lockfile pins it.
      </div>
    );
  }
  switch (ask.kind) {
    case "exposed":
    case "depends":
      return (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th>service</th>
                <th>lockfile</th>
                <th>committed</th>
                <th>via</th>
                <th>hops</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono">{svcSlug(String(r.service))}</td>
                  <td className="font-mono text-muted-foreground">{String(r.sha).slice(0, 12)}</td>
                  <td className="font-mono text-muted-foreground">{fmtEpoch(r.committed_at)}</td>
                  <td className="font-mono text-muted-foreground">{r.via ? short(String(r.via)) : "direct"}</td>
                  <td className="num">{String(r.hops ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "pulls":
      return (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="font-mono text-[12px] text-muted-foreground">
                {String(r.sha).slice(0, 12)} · {fmtEpoch(r.committed_at)} · resolves {short(String(r.version))}
              </div>
              {((r.paths as { chain: string[]; hops: number }[] | undefined) ?? []).map((p, j) => (
                <div key={j} className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[12px]">
                  {p.chain.map((el, k) =>
                    k % 2 === 0 ? (
                      <span key={k} className={`rounded px-1.5 py-0.5 ${k === 0 ? "bg-l2/15 text-l2" : "bg-secondary text-muted-foreground"}`}>
                        {short(el)}
                      </span>
                    ) : (
                      <span key={k} className="text-muted-foreground">
                        ←{el}←
                      </span>
                    ),
                  )}
                  <span className="text-muted-foreground">{p.hops === 0 ? "direct" : `${p.hops} hop${p.hops === 1 ? "" : "s"}`}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case "while-live":
      return (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th>service</th>
                <th>committed</th>
                <th>version</th>
                <th>evidence</th>
                <th>window</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono">{svcSlug(String(r.service))}</td>
                  <td className="font-mono text-muted-foreground">{fmtEpoch(r.resolved_at)}</td>
                  <td className="font-mono text-muted-foreground">{short(String(r.version))}</td>
                  <td className="text-[12px]">
                    <span className={String(r.evidence).includes("in_window") ? "text-l1" : "text-l2"}>{String(r.evidence).replace("+", " + ")}</span>
                  </td>
                  <td className="font-mono text-[11px] text-muted-foreground">
                    {fmtEpoch(r.live_from)} → {fmtEpoch(r.live_to)} ({String(r.live_to_kind)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "versions":
      return (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th>version</th>
                <th>published</th>
                <th>removed</th>
                <th>window</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono">{short(String(r.version))}</td>
                  <td className="font-mono text-muted-foreground">{fmtEpoch(r.published_at)}</td>
                  <td>{r.removed ? <span className="text-l2">yes</span> : <span className="text-muted-foreground">no</span>}</td>
                  <td className="font-mono text-[11px] text-muted-foreground">{String(r.live_to_kind)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "maintainers":
      return (
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {((data.meta?.maintainers as { login: string; twofa: boolean | null }[] | undefined) ?? []).map((m) => (
              <Chip key={m.login}>
                {short(m.login)} · 2FA {m.twofa === null || m.twofa === undefined ? "unknown" : m.twofa ? "on" : "off"}
              </Chip>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th>co-maintained package</th>
                  <th>services resolving it</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono">{short(String(r.package))}</td>
                    <td className="font-mono text-muted-foreground">
                      <span className="num mr-2">{((r.services_at_risk as string[] | undefined) ?? []).length}</span>
                      {((r.services_at_risk as string[] | undefined) ?? []).map(svcSlug).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "typosquats":
      return (
        <div className="flex flex-wrap gap-2">
          {rows.map((r, i) => (
            <Chip key={i}>
              {short(String(r.package))} · {String(r.kind)} · d{String(r.distance)}
            </Chip>
          ))}
        </div>
      );
    case "cypher": {
      const cols = Object.keys(rows[0]);
      return (
        <div className="overflow-x-auto">
          <table className={cn(TABLE, "text-[12.5px]")}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="font-mono text-muted-foreground">
                      {typeof r[c] === "object" ? JSON.stringify(r[c]).slice(0, 200) : String(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}
