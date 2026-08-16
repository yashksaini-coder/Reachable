import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

// The JSON contract with worker/reachable/incident.py. Hand-written on purpose: the committed
// golden files under worker/out/ are the source of truth, and the golden-file test pins the
// Python side. If a shape changes there, change it here in the same commit.

export type Section<Row> = {
  rows: Row[];
  ms: number;
  truncated: boolean;
  cypher: string[]; // the statements that were actually executed, in order
  limitations: string[];
  note?: string;
};

export type Timing = {
  runs: number;
  cold_ms: number | null;
  warm_p50_ms: number | null;
  warm_p95_ms: number | null;
};

export type ExposedRow = {
  service: string;
  lockfile: string;
  sha: string;
  committed_at: number;
  resolved_at: number;
  bad_versions: string[];
  hops: number;
  via: string | null;
  paths: { bad: string; chain: string[]; hops: number }[];
};

export type WhileLiveRow = {
  service: string;
  lockfile: string;
  sha: string;
  version: string;
  removed: boolean;
  resolved_at: number;
  resolved_at_iso: string;
  live_from: number;
  live_from_iso: string;
  live_to: number;
  live_to_iso: string;
  live_to_kind: "exact" | "upper_bound" | "unbounded";
  evidence: "in_window" | "pinned_removed" | "in_window+pinned_removed";
};

export type VersionRow = {
  package: string;
  version: string;
  published_at: number;
  published_at_iso: string;
  removed: boolean | null;
  live_from: number;
  live_from_iso: string;
  live_to: number;
  live_to_iso: string;
  live_to_kind: WhileLiveRow["live_to_kind"];
};

export type MaintainerRow = {
  package: string;
  downloads: number | null;
  maintainers: string[];
  services_at_risk: string[];
};

export type Maintainer = { login: string; twofa: boolean | null; account_created: number | null };

export type TyposquatRow = {
  package: string;
  downloads: number | null;
  distance: number;
  kind: string;
  maintainer: string;
  account_created: number | null;
  twofa: boolean | null;
};

export type Reachability = {
  level: "L0" | "L1" | "L2" | "unscanned";
  files_scanned: number;
  imports: { path: string; line: number; package: string }[];
  symbols: { path: string; line: number; symbol: string; inferred: boolean }[];
  ms: number;
  cypher: string[];
  limitations: string[];
};

export type Incident = {
  advisory: {
    key: string;
    kind: "malware" | "cve";
    severity: string;
    published_at: number;
    published_at_iso: string;
    summary: string;
  };
  provenance: {
    generated_at: string;
    hydradb_image: string | null;
    bolt_uri: string;
    host: string;
    platform: string;
    graph: Record<string, number | null>; // null when the count was rejected (e.g. admission control under load)
    note: string;
  };
  headline: {
    services_exposed: number;
    lockfiles_exposed: number;
    resolved_while_live: number | null;
    reachable_L2: number;
    imported_L1: number;
    present_only_L0: number;
    unscanned: number;
  };
  q1_exposed: Section<ExposedRow> & { services: string[]; lockfiles: number; timing: Timing };
  q1_mspaths: Section<{ bad: string; service: string; chain: string[] }> & {
    sources?: number;
    targets?: number;
    paths?: number;
    timing: Timing;
  };
  q2_versions: Section<VersionRow> & { first: { version: string; published_at: number } | null };
  q3_while_live:
    | (Section<WhileLiveRow> & { services: string[]; in_window: number; pinned_removed: number })
    | null;
  q4_maintainers: Section<MaintainerRow> & { maintainers: Maintainer[] };
  q5_typosquats: Record<string, Section<TyposquatRow>>;
  q7_reachability: Record<string, Reachability>;
  timing_ms: Record<string, number | null>;
};

// worker/out/ is committed; the gallery renders with zero live dependencies (the demo rule).
const OUT = path.resolve(process.cwd(), "..", "worker", "out");

export async function listIncidents(): Promise<Incident[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(OUT)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(names.map((n) => readIncident(n.replace(/\.json$/, ""))));
  return all
    .filter((x): x is Incident => x !== null)
    .sort((a, b) => b.headline.services_exposed - a.headline.services_exposed);
}

export async function readIncident(id: string): Promise<Incident | null> {
  if (!/^[A-Za-z0-9-]+$/.test(id)) return null; // ids are GHSA-…/MAL-…; never a path
  try {
    return JSON.parse(await fs.readFile(path.join(OUT, `${id}.json`), "utf8")) as Incident;
  } catch {
    return null;
  }
}

export const short = (key: string) => key.replace(/^(pkg:npm\/|svc:|lock:|npm:|pkg:fx\/|fx:)/, "");
export const svcSlug = (key: string) => key.replace(/^svc:/, "");
export const fmtMs = (ms: number | null | undefined) =>
  ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 2 : 0)} ms`;
export const fmtUtc = (iso: string | null | undefined) =>
  iso ? iso.replace("T", " ").replace(/\+00:00$/, "Z").replace(/\.\d+Z$/, "Z") : "—";
