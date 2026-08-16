import { C } from './verdict';

/**
 * The landing page's view model. Sample ids (`ADV-2026-0912`, `org/service-*`,
 * `pkg-core`) are neutral placeholders — swap them for real query results, but
 * keep every field's shape, including the ones that carry meaning when empty.
 */

/** Where the two product actions point. One place to wire when the console lands. */
export const LINKS = {
  connect: '/services',
  console: '/incidents',
  docs: 'https://github.com/yashksaini-coder/Reachable#readme',
  status: '/graph',
};

export const ADVISORY = 'ADV-2026-0912';

/** Placeholder — replace with the real graph snapshot from your API. */
export const SNAPSHOT = '2026-08-16 01:41 UTC';

/** The statement behind the numbers. It is never hidden — rule 3. */
export const CYPHER = `MATCH (s:Service)-[:HAS_LOCKFILE]->(l:Lockfile)
      -[:DEPENDS_ON*1..6]->(v:Version)
WHERE v.package = $pkg AND v.version IN $affected
RETURN s.repo, max(l.level) AS verdict,
       count(DISTINCT l) AS lockfiles`;

/** True values. Counters animate down-then-up from these; they never seed 0. */
export const COUNTS = {
  s1: 8,
  s2: 2,
  s3: 5,
  s4: 31,
  s5: 9,
  s6: 1,
  b1: 24,
  b2: 41,
  b3: 212,
  b4: 1.9,
} as const;

export type CountKey = keyof typeof COUNTS;
export type StripKey = Extract<CountKey, `s${string}`>;
export type BandKey = Extract<CountKey, `b${string}`>;

export const STRIP: { key: StripKey; label: string; rule: string; fg: string }[] = [
  { key: 's1', label: 'services exposed', rule: C.sig, fg: C.fg },
  { key: 's2', label: 'act now', rule: C.l2, fg: C.l2 },
  { key: 's3', label: 'resolved while live', rule: C.l1, fg: C.l1 },
  { key: 's4', label: 'maintainer packages', rule: C.sig2, fg: C.fg },
  { key: 's5', label: 'look-alike names', rule: C.sig2, fg: C.fg },
  { key: 's6', label: 'unscanned', rule: C.unk, fg: C.unk },
];

export const BAND: { key: BandKey; label: string; suffix?: string }[] = [
  { key: 'b1', label: 'services watched' },
  { key: 'b2', label: 'lockfiles parsed' },
  { key: 'b3', label: 'advisories tracked' },
  { key: 'b4', label: 'full report, warm', suffix: 's' },
];

export const QUESTIONS = [
  {
    tag: 'Q1',
    meta: '8 rows · 38ms',
    title: 'Which of my services are exposed, and at what level?',
    body: 'A verdict per service, highest across its lockfiles, with the dependency that pulled it in.',
  },
  {
    tag: 'Q2',
    meta: '3 rows · 14ms',
    title: 'Which versions were installable, and for how long?',
    body: 'Exact publish times, the last moment each version was observed installable, and an explicit upper bound.',
  },
  {
    tag: 'Q3',
    meta: '6 rows · 47ms',
    title: 'Who pulled it in while it was still installable?',
    body: 'Every lockfile write intersected with the window, down to the commit that wrote it.',
  },
  {
    tag: 'Q4',
    meta: '31 rows · 88ms',
    title: 'What else could the same maintainers reach?',
    body: 'The other packages those accounts publish, and how many of your services each one would reach.',
  },
  {
    tag: 'Q5',
    meta: '9 rows · 21ms',
    title: 'Which look-alike names exist?',
    body: 'Names one edit away, homoglyphs, scope confusion and reordered words — grouped by kind with edit distance.',
  },
  {
    tag: 'Q6',
    meta: '8 rows · 33ms',
    title: 'What is the blast radius, service by service?',
    body: 'The final ledger: act now, imported, present only, unscanned — plus the command to regenerate it.',
  },
];

export const DIST = [
  { w: '25%', color: C.l2 },
  { w: '37.5%', color: C.l1 },
  { w: '25%', color: C.l0 },
  { w: '12.5%', color: C.unk },
];

export const LEVELS = [
  {
    tag: 'L2',
    color: C.l2,
    title: 'act now',
    body: 'A committed lockfile still resolves an affected version. This is the only level that pages anyone.',
  },
  {
    tag: 'L1',
    color: C.l1,
    title: 'imported',
    body: 'The package was resolved and a code path reaches it — including lockfiles written while the version was live.',
  },
  {
    tag: 'L0',
    color: C.l0,
    title: 'present only',
    body: 'Present in the dependency tree, never imported by any entrypoint Reachable can see.',
  },
  {
    tag: '—',
    color: C.unk,
    title: 'unscanned',
    body: 'No lockfile has been read yet. Styled as unknown, never as safe, and never counted as zero.',
  },
];

export const STEPS = [
  {
    n: '01',
    title: 'Connect a repository',
    body: 'Read-only access to the default branch. Lockfiles and commit metadata only — no source is copied.',
    cmd: 'reachable watch org/service-alpha',
  },
  {
    n: '02',
    title: 'Let the graph settle',
    body: 'Versions, lockfiles, maintainers and advisories link into one namespace. First scan takes a few minutes.',
    cmd: 'reachable status --jobs',
  },
  {
    n: '03',
    title: 'Read the report',
    body: 'Six answers per advisory, each with its statement and latency. Regenerate any time.',
    cmd: `reachable scan --advisory ${ADVISORY}`,
  },
];
