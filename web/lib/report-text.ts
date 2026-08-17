// Pure text renderers for an incident report — Markdown (GitHub), Slack mrkdwn, Discord, plain
// text, JSON. No React, no fs: safe in the route handler and in a node smoke. Deterministic; every
// number comes from the JSON, and the words `upper bound` / `not computed` / `unscanned` are kept
// verbatim (rule 3 of the report).
import type { Incident } from "./incident";
import { fmtMs, fmtUtc, short, svcSlug } from "./format";
import { LEVEL } from "./level";

export type Format = "md" | "slack" | "discord" | "json" | "txt";
export const FORMATS: Format[] = ["md", "slack", "discord", "json", "txt"];
export const MIME: Record<Format, string> = {
  md: "text/markdown; charset=utf-8",
  slack: "text/plain; charset=utf-8",
  discord: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
};

const RANK: Record<string, number> = { L2: 3, L1: 2, unscanned: 1, L0: 0 };
const KIND_LABEL: Record<string, string> = {
  insertion: "one character apart",
  deletion: "one character apart",
  substitution: "one character apart",
  transposition: "one character apart",
  edit2: "two edits apart",
  scope: "scope confusion",
  hyphen: "hyphen",
  homoglyph: "homoglyph",
  prefix_suffix: "prefix / suffix",
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const epoch = (t: number) => fmtUtc(new Date(t * 1000).toISOString());
const kind = (k: string) => k.replace(/_/g, " ");
const liveTo = (r: { live_to_iso: string; live_to_kind: string }) =>
  r.live_to_kind === "unbounded" ? "still installable" : `${fmtUtc(r.live_to_iso)}${r.live_to_kind !== "exact" ? ` (${kind(r.live_to_kind)})` : ""}`;

// Everything the renderers share, derived exactly the way page.tsx derives it.
function derive(inc: Incident, baseUrl: string) {
  const h = inc.headline;
  const q1 = inc.q1_exposed;
  const q3 = inc.q3_while_live;
  const q4 = inc.q4_maintainers;
  const q5 = Object.entries(inc.q5_typosquats);
  const level = (svc: string) => inc.q7_reachability[svc]?.level ?? "unscanned";
  const services = [...new Set(q1.rows.map((r) => r.service))].sort((a, b) => RANK[level(b)] - RANK[level(a)] || a.localeCompare(b));
  const firstRow = (svc: string) => q1.rows.find((r) => r.service === svc)!;
  const watched = inc.q1_mspaths.targets ?? inc.provenance.graph.Service;
  const q5Total = q5.reduce((n, [, s]) => n + s.rows.length, 0);
  const liveBySvc = new Map<string, NonNullable<typeof q3>["rows"][number]>();
  for (const r of q3?.rows ?? []) if (!liveBySvc.has(r.service)) liveBySvc.set(r.service, r);
  const packages = [...new Set(inc.q2_versions.rows.map((r) => short(r.package)))];
  const verdict = [
    `${h.services_exposed} of ${watched ?? "the"} watched services resolved a compromised version`,
    q3 && h.resolved_while_live != null ? `${h.resolved_while_live} did so while it was still installable` : null,
    h.reachable_L2 > 0 ? `${h.reachable_L2} need${h.reachable_L2 === 1 ? "s" : ""} action now` : "none is reachable from first-party code",
  ]
    .filter(Boolean)
    .join("; ");
  const stats: [string, string | number][] = [
    ["services exposed", h.services_exposed],
    ["act now", h.reachable_L2],
    ["resolved while live", q3 ? (h.resolved_while_live ?? "not computed") : "n/a"],
    ["maintainer packages", q4.rows.length],
    ["look-alike names", q5Total],
    ["unscanned", h.unscanned],
  ];
  const q5Groups = new Map<string, string[]>();
  for (const [, s] of q5) for (const r of s.rows) {
    const k = KIND_LABEL[r.kind] ?? r.kind;
    q5Groups.set(k, [...(q5Groups.get(k) ?? []), `${short(r.package)} (d${r.distance})`]);
  }
  const l2 = services.filter((s) => level(s) === "L2");
  const present = services.filter((s) => level(s) === "L0" || level(s) === "L1");
  const unscanned = services.filter((s) => level(s) === "unscanned");
  const q3Kind = q3?.rows[0]?.live_to_kind ?? inc.q2_versions.rows[0]?.live_to_kind;
  const url = `${baseUrl.replace(/\/$/, "")}/incident/${inc.advisory.key}`;
  return { h, q1, q3, q4, q5, level, services, firstRow, q5Total, liveBySvc, packages, verdict, stats, q5Groups, l2, present, unscanned, q3Kind, url };
}

const table = (head: string[], rows: (string | number)[][]) =>
  rows.length
    ? [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`)].join("\n")
    : "_none_";
const details = (cypher: string[]) => `<details><summary>executed statement${cypher.length === 1 ? "" : "s"}</summary>\n\n\`\`\`cypher\n${cypher.join("\n\n")}\n\`\`\`\n\n</details>`;
const cap = (xs: string[], n: number) => (xs.length > n ? [...xs.slice(0, n), `… +${xs.length - n} more`] : xs);
const evidence = (e: string) => (e.includes("in_window") ? "in window" : "") + (e.includes("pinned_removed") ? (e.includes("in_window") ? " · pins removed" : "pins removed") : "");

export function toMarkdown(inc: Incident, baseUrl = ""): string {
  const d = derive(inc, baseUrl);
  const { h, q1, q3, q4, q5 } = d;
  const q2 = inc.q2_versions;
  const out: string[] = [];
  out.push(`# ${inc.advisory.key} — ${inc.advisory.summary}`, "", `${d.verdict}.`, "");
  out.push(table(["stat", "value"], d.stats), "");

  out.push("## Q1 · Which of my services are exposed, and at what level?", "", `${plural(d.services.length, "service")} exposed, ${h.reachable_L2} act now.`, "");
  out.push(
    table(
      ["service", "verdict", "lockfiles", "via", "latest commit"],
      d.services.map((s) => {
        const rows = q1.rows.filter((r) => r.service === s);
        const r = rows[0];
        return [svcSlug(s), LEVEL[d.level(s)].label, rows.length, r.via ? short(r.via) : "direct", `${r.sha.slice(0, 7)} · ${epoch(r.committed_at)}`];
      }),
    ),
    "",
    details(q1.cypher),
    "",
  );

  out.push("## Q2 · Which versions were affected, and when were they live?", "", `${plural(q2.rows.length, "version")} of ${d.packages.join(", ")}${q2.first ? `; first published ${epoch(q2.first.published_at)}` : ""}.`, "");
  out.push(table(["version", "published", "live until (kind)", "removed"], q2.rows.map((r) => [short(r.version), fmtUtc(r.published_at_iso), liveTo(r), r.removed == null ? "unknown" : r.removed ? "yes" : "no"])), "", details(q2.cypher), "");

  out.push("## Q3 · Which services resolved it while it was live?", "");
  if (q3) {
    out.push(`${q3.in_window} in window, ${q3.pinned_removed} pinning a removed version${d.q3Kind === "upper_bound" ? " — live_to is an upper bound" : ""}.`, "");
    out.push(table(["service", "lockfile", "resolved at", "evidence", "window"], q3.rows.map((r) => [svcSlug(r.service), r.sha.slice(0, 7), fmtUtc(r.resolved_at_iso), evidence(r.evidence), `${fmtUtc(r.live_from_iso)} → ${liveTo(r)}`])), "", details(q3.cypher), "");
  } else out.push("n/a — not time-bounded (CVE).", "");

  out.push("## Q4 · What else do the maintainers touch?", "", `${plural(q4.maintainers.length, "maintainer")}: ${q4.maintainers.map((m) => `${short(m.login)}${m.twofa === false ? " (no 2FA)" : ""}`).join(", ") || "none"} — ${plural(q4.rows.length, "co-maintained package")}.`, "");
  out.push(table(["package", "weekly downloads", "services"], q4.rows.map((r) => [short(r.package), r.downloads ?? "—", r.services_at_risk === null ? "— not computed" : r.services_at_risk.length ? r.services_at_risk.map(svcSlug).join(", ") : "none"])), "", details(q4.cypher), "");

  out.push("## Q5 · Which look-alike names exist?", "", `${plural(d.q5Total, "name")} across ${plural(d.q5Groups.size, "kind")}.`, "");
  for (const [k, xs] of d.q5Groups) out.push(`- **${k}**: ${xs.map((x) => `\`${x}\``).join(", ")}`);
  if (d.q5Groups.size) out.push("");
  if (q5.length) out.push(details(q5.flatMap(([, s]) => s.cypher)), "");

  out.push("## Q6 · What is the blast radius, service by service?", "");
  out.push(`- **act now (${d.l2.length})**: ${d.l2.map(svcSlug).join(", ") || "none"}`);
  out.push(`- **resolved while live (${q3 ? d.liveBySvc.size : "n/a"})**: ${[...d.liveBySvc.values()].map((r) => `${svcSlug(r.service)} (${r.sha.slice(0, 7)} · ${fmtUtc(r.resolved_at_iso)})`).join(", ") || (q3 ? "none" : "not time-bounded (CVE)")}`);
  out.push(`- **present only (${d.present.length})**: ${d.present.map((s) => `${svcSlug(s)}${d.level(s) === "L1" ? ` — ${LEVEL.L1.label}` : ""}`).join(", ") || "none"}`);
  out.push(`- **unscanned (${d.unscanned.length})**: ${d.unscanned.map(svcSlug).join(", ") || "none"}`, "");

  const p = inc.provenance;
  out.push("## Provenance", "");
  out.push(`- generated ${fmtUtc(p.generated_at)}`, `- engine ${p.hydradb_image ?? "—"}`, `- bolt ${p.bolt_uri}`);
  out.push(`- graph ${Object.entries(p.graph).map(([k, v]) => `${k} ${v ?? "—"}`).join(" · ")}`, `- composed in ${fmtMs(inc.timing_ms.total)}`, "");
  out.push(`[open the report](${d.url})`, "");
  return out.join("\n");
}

export function toSlack(inc: Incident, baseUrl = ""): string {
  const d = derive(inc, baseUrl);
  const { h, q3, q4 } = d;
  const out: string[] = [];
  out.push(`*${inc.advisory.key} — ${inc.advisory.summary}*`, `${d.verdict}.`, "");
  out.push(`*Headline* · ${d.stats.map(([k, v]) => `${k} \`${v}\``).join(" · ")}`, "");
  out.push("*Q1 exposed*");
  for (const s of cap(d.services, 8)) out.push(s.startsWith("…") ? `• ${s}` : `• \`${svcSlug(s)}\` — ${LEVEL[d.level(s)].label}${d.firstRow(s).via ? ` via ${short(d.firstRow(s).via!)}` : ""}`);
  out.push("*Q2 versions*");
  for (const r of cap(inc.q2_versions.rows.map((r) => `\`${short(r.version)}\` published ${fmtUtc(r.published_at_iso)}, live until ${liveTo(r)}${r.removed ? ", removed" : ""}`), 5)) out.push(`• ${r}`);
  out.push(`*Q3 resolved while live* · ${q3 ? `${q3.in_window} in window, ${q3.pinned_removed} pins removed${d.q3Kind === "upper_bound" ? " (live_to is an upper bound)" : ""}` : "n/a — not time-bounded (CVE)"}`);
  for (const r of cap(q3?.rows.map((r) => `\`${svcSlug(r.service)}\` ${r.sha.slice(0, 7)} at ${fmtUtc(r.resolved_at_iso)} — ${evidence(r.evidence)}`) ?? [], 5)) out.push(`• ${r}`);
  out.push(`*Q4 maintainers* · ${q4.maintainers.map((m) => short(m.login)).join(", ") || "none"} — ${plural(q4.rows.length, "co-maintained package")}`);
  for (const r of cap(q4.rows.map((r) => `\`${short(r.package)}\` ${r.downloads ?? "—"} weekly · ${r.services_at_risk === null ? "not computed" : plural(r.services_at_risk.length, "service")}`), 5)) out.push(`• ${r}`);
  out.push(`*Q5 look-alikes* · ${plural(d.q5Total, "name")}`);
  for (const [k, xs] of d.q5Groups) out.push(`• ${k}: ${cap(xs.map((x) => `\`${x}\``), 6).join(", ")}`);
  out.push("*Q6 blast radius*");
  out.push(`• act now: ${d.l2.map(svcSlug).join(", ") || "none"}`);
  out.push(`• present only: ${d.present.map(svcSlug).join(", ") || "none"}`);
  out.push(`• unscanned: ${d.unscanned.map(svcSlug).join(", ") || "none"}`, "");
  out.push(`generated ${fmtUtc(inc.provenance.generated_at)} · ${h.lockfiles_exposed} lockfile snapshots · ${fmtMs(inc.timing_ms.total)}`, d.url);
  return out.join("\n");
}

export function toDiscord(inc: Incident, baseUrl = ""): string {
  const d = derive(inc, baseUrl);
  const { q3, q4 } = d;
  const out: string[] = [];
  out.push(`## ${inc.advisory.key} — ${inc.advisory.summary}`, `${d.verdict}.`, "");
  out.push(d.stats.map(([k, v]) => `**${k}** ${v}`).join(" · "), "");
  out.push("**Q1 exposed**");
  for (const s of cap(d.services, 6)) out.push(s.startsWith("…") ? `- ${s}` : `- \`${svcSlug(s)}\` — ${LEVEL[d.level(s)].label}`);
  out.push(`**Q2 versions** · ${cap(inc.q2_versions.rows.map((r) => `\`${short(r.version)}\` live until ${liveTo(r)}`), 3).join(", ")}`);
  out.push(`**Q3 resolved while live** · ${q3 ? `${q3.in_window} in window, ${q3.pinned_removed} pins removed${d.q3Kind === "upper_bound" ? " (upper bound)" : ""}` : "n/a (CVE)"}`);
  out.push(`**Q4 maintainers** · ${q4.maintainers.map((m) => short(m.login)).join(", ") || "none"} — ${plural(q4.rows.length, "co-maintained package")}`);
  out.push(`**Q5 look-alikes** · ${d.q5Total ? [...d.q5Groups].map(([k, xs]) => `${k}: ${cap(xs, 3).join(", ")}`).join("; ") : "none"}`);
  out.push(`**Q6** · act now ${d.l2.map(svcSlug).join(", ") || "none"} · present only ${d.present.length} · unscanned ${d.unscanned.length}`, "");
  out.push("```cypher", d.q1.cypher[0] ?? "", "```", d.url);
  let s = out.join("\n");
  if (s.length > 1900) {
    // ponytail: drop the statement first, then hard-truncate — the link always survives
    s = out.filter((l) => !l.startsWith("```") && l !== d.q1.cypher[0]).join("\n");
    if (s.length > 1900) s = `${s.slice(0, 1900 - d.url.length - 3).trimEnd()}…\n${d.url}`;
  }
  return s;
}

export function toText(inc: Incident, baseUrl = ""): string {
  const d = derive(inc, baseUrl);
  const { q3, q4 } = d;
  const w = Math.max(...d.stats.map(([k]) => k.length));
  const out: string[] = [];
  out.push(`${inc.advisory.key} — ${inc.advisory.summary}`, `${d.verdict}.`, "");
  for (const [k, v] of d.stats) out.push(`  ${k.padEnd(w)}  ${v}`);
  out.push("", "Q1 exposed");
  for (const s of d.services) out.push(`  ${svcSlug(s)}  ${LEVEL[d.level(s)].label}${d.firstRow(s).via ? `  via ${short(d.firstRow(s).via!)}` : ""}`);
  out.push("", "Q2 versions");
  for (const r of inc.q2_versions.rows) out.push(`  ${short(r.version)}  published ${fmtUtc(r.published_at_iso)}  live until ${liveTo(r)}${r.removed ? "  removed" : ""}`);
  out.push("", `Q3 resolved while live  ${q3 ? `${q3.in_window} in window, ${q3.pinned_removed} pins removed` : "n/a — not time-bounded (CVE)"}`);
  for (const r of q3?.rows ?? []) out.push(`  ${svcSlug(r.service)}  ${r.sha.slice(0, 7)}  ${fmtUtc(r.resolved_at_iso)}  ${evidence(r.evidence)}  ${fmtUtc(r.live_from_iso)} → ${liveTo(r)}`);
  out.push("", `Q4 maintainers  ${q4.maintainers.map((m) => short(m.login)).join(", ") || "none"}`);
  for (const r of q4.rows) out.push(`  ${short(r.package)}  ${r.downloads ?? "—"} weekly  ${r.services_at_risk === null ? "— not computed" : r.services_at_risk.length ? r.services_at_risk.map(svcSlug).join(", ") : "none"}`);
  out.push("", `Q5 look-alikes  ${plural(d.q5Total, "name")}`);
  for (const [k, xs] of d.q5Groups) out.push(`  ${k}: ${xs.join(", ")}`);
  out.push("", "Q6 blast radius");
  out.push(`  act now: ${d.l2.map(svcSlug).join(", ") || "none"}`);
  out.push(`  resolved while live: ${[...d.liveBySvc.keys()].map(svcSlug).join(", ") || (q3 ? "none" : "n/a")}`);
  out.push(`  present only: ${d.present.map(svcSlug).join(", ") || "none"}`);
  out.push(`  unscanned: ${d.unscanned.map(svcSlug).join(", ") || "none"}`);
  const p = inc.provenance;
  out.push("", `generated ${fmtUtc(p.generated_at)} · engine ${p.hydradb_image ?? "—"} · ${p.bolt_uri}`, `graph ${Object.entries(p.graph).map(([k, v]) => `${k} ${v ?? "—"}`).join(" · ")}`, "", d.url);
  return out.join("\n");
}

export function render(inc: Incident, format: Format, baseUrl = ""): string {
  switch (format) {
    case "md":
      return toMarkdown(inc, baseUrl);
    case "slack":
      return toSlack(inc, baseUrl);
    case "discord":
      return toDiscord(inc, baseUrl);
    case "txt":
      return toText(inc, baseUrl);
    case "json":
      return JSON.stringify(inc, null, 2);
  }
}
