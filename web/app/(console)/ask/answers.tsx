import type { ReactNode } from "react";
import { SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, Kind } from "@/components/console/ui";
import { short, svcSlug } from "@/lib/format";
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
      const at = rows.filter((r) => ((r.services_at_risk as string[] | null | undefined) ?? []).length > 0).length;
      const m = (data.meta?.maintainers as unknown[] | undefined)?.length ?? 0;
      return `${plural(m, "maintainer")} co-maintain ${plural(rows.length, "other package")}, ${at} of them resolved by watched services.`;
    }
    case "typosquats":
      return `${plural(rows.length, "name")} sit one edit away from ${ask.package}: ${list(rows.map((r) => short(String(r.package))))}.`;
    case "cypher":
      return `${plural(rows.length, "row")}, ${Object.keys(rows[0]).length} columns.`;
  }
}

// Token table: th 10.5px uppercase tracked --dim on a --border rule; td 12.5px --mut on --line rules;
// row hover --hover. Wide tables scroll inside their card (rule 7).
const TABLE =
  "w-full border-collapse [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:pb-[9px] [&_th]:pt-3.5 [&_th]:text-left [&_th]:text-[10.5px] [&_th]:font-medium [&_th]:uppercase [&_th]:leading-none [&_th]:tracking-[0.09em] [&_th]:text-dim [&_th]:border-b [&_th]:border-border [&_td]:h-10 [&_td]:whitespace-nowrap [&_td]:border-b [&_td]:border-line [&_td]:p-3 [&_td]:align-middle [&_td]:text-[12.5px] [&_td]:text-mut [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-[180ms] [&_tbody_tr:hover]:bg-hover";

// The typed result sits in a --card box, 10px radius, scrolling sideways inside itself.
const Box = ({ children, pad = false }: { children: ReactNode; pad?: boolean }) => (
  <div className={cn("overflow-x-auto rounded-[10px] border border-border bg-card", pad && "p-3")}>{children}</div>
);

export function Answer({ ask, data }: { ask: Ask; data: AskData }) {
  const rows = (data.rows ?? []) as Row[];
  if (rows.length === 0) {
    return (
      <Box pad>
        <div className="flex flex-col items-center gap-3 py-5 text-center">
          <span className="grid size-11 place-items-center rounded-full border border-border text-dim" aria-hidden>
            <SearchX className="size-[17px]" />
          </span>
          <p className="max-w-[44ch] text-pretty text-[12.5px] text-mut">Nothing in the graph matches this question.</p>
        </div>
      </Box>
    );
  }
  switch (ask.kind) {
    case "exposed":
    case "depends":
      return (
        <Box>
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
                  <td className="font-mono text-[12px] text-fg">{svcSlug(String(r.service))}</td>
                  <td className="font-mono text-dim">{String(r.sha).slice(0, 12)}</td>
                  <td className="font-mono text-dim">{fmtEpoch(r.committed_at)}</td>
                  <td className="font-mono text-dim">{r.via ? short(String(r.via)) : "direct"}</td>
                  <td className="num">{r.hops == null ? <span className="text-dim">direct</span> : String(r.hops)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      );
    case "pulls":
      return (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <Box key={i} pad>
              <div className="font-mono text-[11px] text-dim">
                {String(r.sha).slice(0, 12)} · {fmtEpoch(r.committed_at)} · resolves {short(String(r.version))}
              </div>
              {((r.paths as { chain: string[]; hops: number }[] | undefined) ?? []).map((p, j) => (
                <div key={j} className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[11.5px]">
                  {p.chain.map((el, k) =>
                    k % 2 === 0 ? (
                      <span key={k} className={cn("rounded-sm px-1.5 py-[3px]", k === 0 ? "bg-sigfill text-signal-2" : "bg-hover text-mut")}>
                        {short(el)}
                      </span>
                    ) : (
                      <span key={k} className="text-[10.5px] text-dim">
                        ←{el}←
                      </span>
                    ),
                  )}
                  <span className="text-[10.5px] text-dim">{p.hops === 0 ? "direct" : `${p.hops} hop${p.hops === 1 ? "" : "s"}`}</span>
                </div>
              ))}
            </Box>
          ))}
        </div>
      );
    case "while-live":
      return (
        <Box>
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
                  <td className="font-mono text-[12px] text-fg">{svcSlug(String(r.service))}</td>
                  <td className="font-mono text-dim">{fmtEpoch(r.resolved_at)}</td>
                  <td className="font-mono text-dim">{short(String(r.version))}</td>
                  <td>
                    <span className={String(r.evidence).includes("in_window") ? "text-l1" : "text-l2"}>{String(r.evidence).replace(/_/g, " ").replace("+", " + ")}</span>
                  </td>
                  <td className="font-mono text-[11px] text-dim">
                    {fmtEpoch(r.live_from)} → {fmtEpoch(r.live_to)} <Kind kind={String(r.live_to_kind)} className="ml-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      );
    case "versions":
      return (
        <Box>
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
                  <td className="font-mono text-[12px] text-fg">{short(String(r.version))}</td>
                  <td className="font-mono text-dim">{fmtEpoch(r.published_at)}</td>
                  <td>{r.removed ? <span className="text-l2">yes</span> : <span className="text-dim">no</span>}</td>
                  <td><Kind kind={String(r.live_to_kind)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      );
    case "maintainers":
      return (
        <div>
          <div className="mb-2.5 flex flex-wrap gap-2">
            {((data.meta?.maintainers as { login: string; twofa: boolean | null }[] | undefined) ?? []).map((m) => (
              <Chip key={m.login}>
                {short(m.login)} · 2FA {m.twofa === null || m.twofa === undefined ? "unknown" : m.twofa ? "on" : "off"}
              </Chip>
            ))}
          </div>
          <Box>
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
                    <td className="font-mono text-[12px] text-fg">{short(String(r.package))}</td>
                    <td className="max-w-[42ch] truncate font-mono text-dim" title={Array.isArray(r.services_at_risk) ? (r.services_at_risk as string[]).map(svcSlug).join(", ") : undefined}>
                      {r.services_at_risk == null ? (
                        <span className="text-dim">— not computed</span>
                      ) : (
                        <>
                          <span className="num mr-2">{(r.services_at_risk as string[]).length}</span>
                          {(r.services_at_risk as string[]).map(svcSlug).join(", ")}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </div>
      );
    case "typosquats":
      return (
        <Box pad>
          <div className="flex flex-wrap gap-2">
            {rows.map((r, i) => (
              <Chip key={i}>
                {short(String(r.package))} · {String(r.kind)} · <span className="text-dim">d{String(r.distance)}</span>
              </Chip>
            ))}
          </div>
        </Box>
      );
    case "cypher": {
      const cols = Object.keys(rows[0]);
      return (
        <Box>
          <table className={TABLE}>
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
                    <td key={c} className="max-w-[42ch] truncate font-mono text-dim" title={typeof r[c] === "object" ? JSON.stringify(r[c]).slice(0, 200) : String(r[c])}>
                      {typeof r[c] === "object" ? JSON.stringify(r[c]).slice(0, 200) : String(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      );
    }
  }
}
