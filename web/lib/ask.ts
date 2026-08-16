// Parse a typed question into a live API call. Deliberately a small grammar, not an LLM:
// every shape maps to a query verified against the engine, and the user sees exactly which.
export type Ask =
  | { kind: "exposed"; advisory: string; service?: string }
  | { kind: "pulls"; package: string; service: string }
  | { kind: "while-live"; advisory: string }
  | { kind: "depends"; package: string; version: string }
  | { kind: "versions"; advisory: string }
  | { kind: "maintainers"; advisory: string }
  | { kind: "typosquats"; package: string }
  | { kind: "cypher"; q: string };

const ADV = /(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|MAL-\d{4}-\d+|CVE-\d{4}-\d+|MAL-TEST-\d+|GHSA-TEST-[A-Z]+)/i;
const SLUG = /\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/;
const PKGVER = /((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/;
const PKG = /\b((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)\b/;

export const EXAMPLES: { q: string; hint: string }[] = [
  { q: "is GoMake-ltd/n8n-node-gomake exposed to MAL-2025-46974", hint: "membership + proving path" },
  { q: "who resolved MAL-2025-46974 while it was live", hint: "the temporal window, in-engine" },
  { q: "what pulls chalk into wagtail/wagtail", hint: "which of your deps brings it in" },
  { q: "which services depend on debug@4.4.2", hint: "exact version, one hop" },
  { q: "maintainers of MAL-2025-46969", hint: "shared-maintainer fan-out" },
  { q: "typosquats near chalk", hint: "materialised name proximity" },
  { q: "MATCH (s:Service) RETURN s.key AS service LIMIT 20", hint: "read-only Cypher console" },
];

export function parseAsk(raw: string): Ask | { error: string } {
  const q = raw.trim();
  if (!q) return { error: "ask something" };
  if (/^\s*(MATCH|CALL)\b/i.test(q)) return { kind: "cypher", q };
  const lower = q.toLowerCase();
  const adv = q.match(ADV)?.[1];
  const slug = q.replace(ADV, "").match(SLUG)?.[1];
  const pv = q.match(PKGVER);

  if (/(while|window|live)/.test(lower) && adv) return { kind: "while-live", advisory: adv };
  if (/(maintainer|who maintains|shares)/.test(lower) && adv) return { kind: "maintainers", advisory: adv };
  if (/(version|introduc)/.test(lower) && adv && !/depend/.test(lower)) return { kind: "versions", advisory: adv };
  if (/(typosquat|near|similar|look-?alike)/.test(lower)) {
    const pkg = q.replace(/(typosquats?|near|similar to|look-?alikes? of|packages?)/gi, "").trim().match(PKG)?.[1];
    if (pkg) return { kind: "typosquats", package: pkg };
  }
  if (/(pulls?|brings?|why is|how does).*(into|in)\b/.test(lower) && slug) {
    const pkg = q.replace(SLUG, "").replace(/(what|which|pulls?|brings?|why is|how does|into|in|get|there|does|the|dependency|package)/gi, " ").trim().match(PKG)?.[1];
    if (pkg) return { kind: "pulls", package: pkg, service: slug };
  }
  if (pv && /(depend|resolv|use|pin|has|have|which)/.test(lower)) return { kind: "depends", package: pv[1], version: pv[2] };
  if (adv) return { kind: "exposed", advisory: adv, service: slug };
  if (pv) return { kind: "depends", package: pv[1], version: pv[2] };
  return {
    error:
      "I can answer: exposure to an advisory (optionally for one owner/repo), 'who resolved <advisory> while it was live', 'what pulls <package> into <owner/repo>', 'which services depend on <package>@<version>', 'maintainers of <advisory>', 'typosquats near <package>', or a read-only MATCH/CALL statement.",
  };
}

export function askToPath(a: Ask): { path: string; params: Record<string, string> } {
  switch (a.kind) {
    case "exposed":
      return { path: "/ask/exposed", params: { advisory: a.advisory, ...(a.service ? { service: a.service } : {}) } };
    case "pulls":
      return { path: "/ask/pulls", params: { package: a.package, service: a.service } };
    case "while-live":
      return { path: "/ask/while-live", params: { advisory: a.advisory } };
    case "depends":
      return { path: "/ask/depends", params: { package: a.package, version: a.version } };
    case "versions":
      return { path: "/ask/versions", params: { advisory: a.advisory } };
    case "maintainers":
      return { path: "/ask/maintainers", params: { advisory: a.advisory } };
    case "typosquats":
      return { path: "/ask/typosquats", params: { package: a.package } };
    case "cypher":
      return { path: "/cypher", params: { q: a.q } };
  }
}

export function describe(a: Ask): string {
  switch (a.kind) {
    case "exposed":
      return a.service ? `Is ${a.service} exposed to ${a.advisory}?` : `Who is exposed to ${a.advisory}?`;
    case "pulls":
      return `What pulls ${a.package} into ${a.service}?`;
    case "while-live":
      return `Who resolved ${a.advisory} while it was live?`;
    case "depends":
      return `Which services depend on ${a.package}@${a.version}?`;
    case "versions":
      return `Which versions does ${a.advisory} affect, and which came first?`;
    case "maintainers":
      return `Which packages share a maintainer with ${a.advisory}'s package?`;
    case "typosquats":
      return `Which names sit one edit away from ${a.package}?`;
    case "cypher":
      return "Read-only Cypher";
  }
}
