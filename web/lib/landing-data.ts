import type { Incident, WhileLiveRow } from './incident';
import { fmtMs, short, svcSlug } from './format';
import { C } from './verdict';

/**
 * The landing page's view model. Every number here is read from a committed
 * incident report (worker/out/*.json) — nothing is invented and nothing is
 * estimated. `buildLanding` is pure so it can run in the server page and its
 * output can be handed to client leaves as plain props.
 */

/** Where the product actions point. */
export const LINKS = {
  connect: '/services',
  console: '/incidents',
  docs: 'https://github.com/yashksaini-coder/Reachable#readme',
  status: '/graph',
};

/** The incident the landing narrates. */
export const LANDING_INCIDENT = 'MAL-2025-46974';

/** The literal that stands in for a value the worker did not compute — rule 3. */
export const NOT_COMPUTED = '— not computed';

export type CountStat = { key: string; label: string; n: number | null; rule?: string; fg?: string; suffix?: string };

export type BlastNode = {
  label: string;
  /** columns 0-2: the second line and the box stroke */
  sub?: string;
  color?: string;
  /** column 3: the verdict and its dot colour */
  v?: string;
  c?: string;
};

export type BlastData = {
  cols: BlastNode[][];
  /** [fromCol, fromIdx, toCol, toIdx, amber] */
  edges: [number, number, number, number, boolean][];
  note: string | null;
};

export type TimelineData = {
  liveFrom: number;
  liveTo: number;
  liveToKind: WhileLiveRow['live_to_kind'];
  advisoryAt: number;
  versions: number;
  commits: { at: number; service: string; evidence: WhileLiveRow['evidence'] }[];
};

export type LandingModel = {
  advisory: string;
  headLevel: { label: string; color: string; bg: string };
  headMeta: string;
  strip: CountStat[];
  band: CountStat[];
  questions: { tag: string; title: string; body: string; meta: string }[];
  evidence: { question: string; cypher: string; meta: string };
  dist: { label: string; n: number; color: string }[];
  snapshot: string;
  blast: BlastData | null;
  timeline: TimelineData | null;
  windowMeta: string;
  windowNotes: { glyph: string; color?: string; mono?: boolean; text: string }[];
};

const LEVEL_COLOR: Record<string, string> = { L2: C.l2, L1: C.l1, L0: C.l0, unscanned: C.unk };
const RANK: Record<string, number> = { L2: 3, L1: 2, unscanned: 1, L0: 0 };
const CAP = 6;

const meta = (rows: number, ms: number) => `${rows} row${rows === 1 ? '' : 's'} · ${fmtMs(ms)}`;
const repo = (svc: string) => svcSlug(svc).split('/').pop() ?? svc;

/** Whitespace-only reflow so a one-line statement reads as Cypher; tokens are untouched. */
export const prettyCypher = (s: string) => s.replace(/\s+(WHERE|RETURN|ORDER BY|WITH|LIMIT)\b/g, '\n$1');

export const fmtSnapshot = (iso: string) => `${iso.replace('T', ' ').slice(0, 16)} UTC`;

export function buildLanding(inc: Incident): LandingModel {
  const h = inc.headline;
  const q1 = inc.q1_exposed;
  const q2 = inc.q2_versions;
  const q3 = inc.q3_while_live;
  const q4 = inc.q4_maintainers;
  const q5 = Object.values(inc.q5_typosquats);
  const q5Rows = q5.reduce((n, s) => n + s.rows.length, 0);
  const q5Ms = q5.reduce((n, s) => n + s.ms, 0);
  const g = inc.provenance.graph;
  const level = (svc: string) => inc.q7_reachability[svc]?.level ?? 'unscanned';

  const sections = [q1, inc.q1_mspaths, q2, q3, q4, ...q5, ...Object.values(inc.q7_reachability)];
  const statements = sections.reduce((n, s) => n + (s?.cypher.length ?? 0), 0);
  const rows = [q1, inc.q1_mspaths, q2, q3, q4, ...q5].reduce((n, s) => n + (s?.rows.length ?? 0), 0);
  const total = inc.timing_ms.total;

  const headLevel =
    h.reachable_L2 > 0
      ? { label: 'act now', color: C.l2, bg: 'rgba(255,92,92,.14)' }
      : h.imported_L1 > 0
        ? { label: 'imported', color: C.l1, bg: 'rgba(245,180,0,.14)' }
        : h.present_only_L0 > 0
          ? { label: 'present only', color: C.l0, bg: 'rgba(47,208,127,.14)' }
          : h.unscanned > 0
            ? { label: 'unscanned', color: C.unk, bg: 'rgba(139,147,167,.14)' }
            : { label: 'no service exposed', color: C.dim, bg: 'rgba(139,147,167,.14)' };

  // ---- blast graph: version → dependency → lockfile → service, from the real q1 paths
  let blast: BlastData | null = null;
  if (q1.rows.length) {
    const inQ3 = new Map<string, WhileLiveRow['evidence']>();
    for (const r of q3?.rows ?? []) if (!inQ3.has(r.lockfile)) inQ3.set(r.lockfile, r.evidence);
    const ranked = [...new Set(q1.rows.map((r) => r.service))].sort(
      (a, b) => (RANK[level(b)] ?? 0) - (RANK[level(a)] ?? 0) || a.localeCompare(b),
    );
    const lockRows = q1.rows.filter((r) => ranked.indexOf(r.service) < CAP).slice(0, CAP);
    const services = ranked.filter((s) => lockRows.some((r) => r.service === s));
    const chainsOf = (r: (typeof q1.rows)[number]) =>
      r.paths.length ? r.paths.map((p) => p.chain.filter((_, i) => i % 2 === 0)) : r.bad_versions.map((b) => [b, r.lockfile]);
    // dependency column: "direct" plus the most frequent first-hop dependents
    const freq = new Map<string, number>();
    for (const r of lockRows) for (const k of chainsOf(r)) freq.set(k.length > 2 ? k[1] : 'direct', (freq.get(k.length > 2 ? k[1] : 'direct') ?? 0) + 1);
    const deps = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k);
    const bads = [...new Set(lockRows.flatMap((r) => r.bad_versions))];
    const cols: BlastNode[][] = [
      bads.map((b) => ({ label: short(b), sub: 'affected', color: C.l2 })),
      deps.map((d) => (d === 'direct' ? { label: 'direct dependency', sub: 'resolved directly', color: C.unk } : { label: short(d), sub: 'dependency', color: C.unk })),
      lockRows.map((r) => {
        const ev = inQ3.get(r.lockfile);
        return {
          label: `${repo(r.lockfile.replace(/@[^@]*$/, ''))}@${r.sha.slice(0, 7)}`,
          sub: !ev ? 'resolved' : ev.startsWith('in_window') ? 'in window' : 'pins erased version',
          color: ev ? C.l1 : C.unk,
        };
      }),
      services.map((s) => ({ label: svcSlug(s), v: level(s), c: LEVEL_COLOR[level(s)] })),
    ];
    const edges = new Map<string, [number, number, number, number, boolean]>();
    const link = (c1: number, i1: number, c2: number, i2: number, amber = false) => {
      if (i1 < 0 || i2 < 0) return;
      edges.set(`${c1}.${i1}>${c2}.${i2}`, [c1, i1, c2, i2, amber]);
    };
    lockRows.forEach((r, li) => {
      const amber = inQ3.has(r.lockfile);
      for (const k of chainsOf(r)) {
        const dep = k.length > 2 ? k[1] : 'direct';
        const di = deps.indexOf(dep);
        link(0, bads.indexOf(k[0]), 1, di);
        link(1, di, 2, li, amber);
      }
      link(2, li, 3, services.indexOf(r.service));
    });
    const hidden = q1.rows.length - lockRows.length;
    blast = { cols, edges: [...edges.values()], note: hidden > 0 ? `showing ${lockRows.length} of ${q1.rows.length} lockfiles · worst verdicts first` : null };
  }

  const timeline: TimelineData | null =
    q3 && q3.rows.length
      ? {
          liveFrom: Math.min(...q3.rows.map((r) => r.live_from)),
          liveTo: Math.max(...q3.rows.map((r) => r.live_to)),
          liveToKind: q3.rows[0].live_to_kind,
          advisoryAt: inc.advisory.published_at,
          versions: q2.rows.length,
          commits: q3.rows.map((r) => ({ at: r.resolved_at, service: repo(r.service), evidence: r.evidence })),
        }
      : null;

  const inWindow = q3?.rows.filter((r) => r.evidence.startsWith('in_window')).length ?? 0;
  const erasedOnly = q3?.rows.filter((r) => r.evidence === 'pinned_removed').length ?? 0;
  const lockfiles = (n: number) => `${n} lockfile${n === 1 ? '' : 's'}`;
  const upper = q3?.rows.some((r) => r.live_to_kind === 'upper_bound');

  return {
    advisory: inc.advisory.key,
    headLevel,
    headMeta: `${statements} statements · ${rows} rows · ${total == null ? NOT_COMPUTED : `${(total / 1000).toFixed(1)}s`}`,
    strip: [
      { key: 's1', label: 'services exposed', n: h.services_exposed, rule: C.sig, fg: C.fg },
      { key: 's2', label: 'act now', n: h.reachable_L2, rule: C.l2, fg: C.l2 },
      { key: 's3', label: 'resolved while live', n: h.resolved_while_live, rule: C.l1, fg: C.l1 },
      { key: 's4', label: 'maintainer packages', n: q4.rows.length, rule: C.sig2, fg: C.fg },
      { key: 's5', label: 'look-alike names', n: q5Rows, rule: C.sig2, fg: C.fg },
      { key: 's6', label: 'unscanned', n: h.unscanned, rule: C.unk, fg: C.unk },
    ],
    band: [
      { key: 'b1', label: 'services watched', n: g.Service ?? null },
      { key: 'b2', label: 'lockfiles parsed', n: g.Lockfile ?? null },
      { key: 'b3', label: 'advisories tracked', n: g.Advisory ?? null },
      { key: 'b4', label: 'full report, wall-clock', n: total == null ? null : Math.round(total / 100) / 10, suffix: 's' },
    ],
    questions: [
      { tag: 'Q1', meta: meta(q1.rows.length, q1.ms), ...Q_COPY[0] },
      { tag: 'Q2', meta: meta(q2.rows.length, q2.ms), ...Q_COPY[1] },
      { tag: 'Q3', meta: q3 ? meta(q3.rows.length, q3.ms) : 'not time-bounded (CVE)', ...Q_COPY[2] },
      { tag: 'Q4', meta: meta(q4.rows.length, q4.ms), ...Q_COPY[3] },
      { tag: 'Q5', meta: meta(q5Rows, q5Ms), ...Q_COPY[4] },
      { tag: 'Q6', meta: meta(inc.q1_mspaths.rows.length, inc.q1_mspaths.ms), ...Q_COPY[5] },
    ],
    evidence: {
      question: 'who pulled it in while it was still installable?',
      cypher: prettyCypher(q3?.cypher[0] ?? q1.cypher[0]),
      meta: q3 ? meta(q3.rows.length, q3.ms) : meta(q1.rows.length, q1.ms),
    },
    dist: [
      { label: 'act now', n: h.reachable_L2, color: C.l2 },
      { label: 'imported', n: h.imported_L1, color: C.l1 },
      { label: 'present only', n: h.present_only_L0, color: C.l0 },
      { label: 'unscanned', n: h.unscanned, color: C.unk },
    ],
    snapshot: fmtSnapshot(inc.provenance.generated_at),
    blast,
    timeline,
    windowMeta: q3 ? meta(q3.rows.length, q3.ms) : 'not time-bounded (CVE)',
    windowNotes: [
      { glyph: '▲', color: C.l1, text: `${lockfiles(inWindow)} committed inside the window` },
      { glyph: '▲', color: C.l1, text: `${lockfiles(erasedOnly)} more pin the erased version — only possible while it was live` },
      { glyph: '◌', mono: true, text: upper ? 'the dashed edge is an upper bound, never a claim' : 'the window edge is exact' },
    ],
  };
}

const Q_COPY = [
  {
    title: 'Which of my services are exposed, and at what level?',
    body: 'A verdict per service, highest across its lockfiles, with the dependency that pulled it in.',
  },
  {
    title: 'Which versions were installable, and for how long?',
    body: 'Exact publish times, the last moment each version was observed installable, and an explicit upper bound.',
  },
  {
    title: 'Who pulled it in while it was still installable?',
    body: 'Every lockfile write intersected with the window, down to the commit that wrote it.',
  },
  {
    title: 'What else could the same maintainers reach?',
    body: 'The other packages those accounts publish, and how many of your services each one would reach.',
  },
  {
    title: 'Which look-alike names exist?',
    body: 'Names one edit away, scope confusion and reordered words — grouped by kind with edit distance.',
  },
  {
    title: 'What is the blast radius, service by service?',
    body: 'The final ledger: act now, imported, present only, unscanned — plus the command to regenerate it.',
  },
];

export const LEVELS = [
  {
    tag: 'L2',
    color: C.l2,
    title: 'act now',
    body: "First-party code references the affected package's vulnerable symbol. This is the only level that pages anyone.",
  },
  {
    tag: 'L1',
    color: C.l1,
    title: 'imported',
    body: 'First-party code imports the package; the vulnerable symbol is not referenced.',
  },
  {
    tag: 'L0',
    color: C.l0,
    title: 'present only',
    body: 'In the install tree, never imported by any scanned file.',
  },
  {
    tag: '—',
    color: C.unk,
    title: 'unscanned',
    body: 'Exposed, but its source was not read. Styled as unknown, never as safe, and never counted as zero.',
  },
];

export const STEPS = [
  {
    n: '01',
    title: 'Bring the console up',
    body: 'One HydraDB node, the worker API and this console. Nothing runs anywhere else.',
    cmd: 'make up',
  },
  {
    n: '02',
    title: 'Connect a repository',
    body: 'Lockfiles and commit metadata via the GitHub API; versions and maintainers from npm; advisories from OSV. First ingest of a large repository takes minutes.',
    cmd: 'make add REPO=owner/repo',
  },
  {
    n: '03',
    title: 'Read the report',
    body: 'Six answers per advisory, each with its statement and measured latency. Regenerate any time.',
    cmd: `make incident ID=${LANDING_INCIDENT} ARGS="--out"`,
  },
];
