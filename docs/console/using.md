# Using it

{{figure:using.png|Reachable — the console: six answer cards and a printed report}}

The console reads two things: the **committed incident reports** (`worker/out/*.json`, rendered
statically, always available) and the **live worker API** (`:8787`, which talks to HydraDB). Pages
that need the worker degrade on purpose when it is down — they say so, they never guess. This
chapter walks the console in the order you would use it; the grammar, ports and caps live in the
reference chapters.

## Add a repository

[Live: Services](/services).


On **Services**, type `owner/repo` or paste a GitHub URL and press **Add**. The job runs in the
worker and its progress streams into the job card, four steps in order:

1. **lockfiles** — read the commit history of the lockfile at the repository root and walk every
   snapshot; each becomes a `Lockfile` node whose `RESOLVED` edges are the flattened install
   tree the package manager wrote.
2. **packages** — enrich every resolved version from the registry: publish times, removals,
   maintainers, weekly downloads.
3. **advisories** — link OSV advisories to the ingested versions, with the installable window on
   the `AFFECTS` edge.
4. **reach** — scan first-party JS/TS at the newest exposed lockfile commit for imports of the
   advisory-affected packages, so verdicts can say L0 or L1 rather than `unscanned`.

Supported lockfiles: npm `package-lock.json` (lockfileVersion 2 and 3) and pnpm `pnpm-lock.yaml`
(6.x and 9.x), at the repository root; `package-lock.json` is tried first and the first path with
commits wins. `yarn.lock` and bun lockfiles are detected and refused with a clear "not supported
yet"; monorepo sub-directories are not scanned yet. Steps show `—` (not a time) while running and
live `i/n` progress; a job cut off by a worker restart comes back as `interrupted` with a
**retry** button (retries are idempotent), and the table flags a service whose latest job did not
finish as `partial · retry`. When the job completes, **view on board** opens the service where it
now sits. The graph the guide describes holds {{stat:provenance.graph.Service|int}} services and
{{stat:provenance.graph.Lockfile|int}} lockfile snapshots.

## Read a report

[Live: the report](/incident/{{stat:advisory.key}}).

Open **Incidents** and click an advisory. The report for `{{stat:advisory.key}}` reads top to
bottom; the right rail is a mini-map that tracks the section in view.

- **Headline** — one sentence and a six-stat strip: {{stat:headline.services_exposed}} services
  exposed · {{stat:headline.resolved_while_live}} resolved while live ·
  {{stat:headline.reachable_L2}} act now · {{stat:headline.imported_L1}} imported ·
  {{stat:headline.present_only_L0}} present only · {{stat:headline.unscanned}} unscanned.
- **Blast radius** — the graph version → dependency → lockfile → service, amber where the
  lockfile resolved while the version was installable.
- **Q1 exposed** — verdict distribution and the service table: {{stat:q1_exposed.lockfiles|int}}
  lockfiles, {{stat:q1_exposed.timing.warm_p50_ms|ms}} warm.
- **Q2 versions** — publish times, the `removed` flag and the window; the `upper bound` chip sits
  next to `live_to` because npm publishes no takedown time.
- **Q3 while live** — the installable-window timeline and the evidence table (`in window` ·
  `pins removed`), {{stat:q3_while_live.ms|ms}}.
- **Q4 maintainers** — co-maintained packages ranked by weekly downloads with the services
  resolving each today; exposure is computed for the eight most downloaded, the rest read
  `— not computed`. This is the slow card: {{stat:q4_maintainers.ms|ms}} on the guide incident.
- **Q5 look-alikes** — near-names by kind and edit distance, {{stat:timing_ms.q5|ms}}.
- **Q6 ledger** — the verdict per service, the command that regenerates the report and the README
  badge; then **Beyond the watched set** and provenance.

Every card has a **hydradb** strip with the statement, the row count and the wall-clock ms; it can
be collapsed but never hidden. Click a service in Q1 or the ledger for the **service detail**: one
card per exposed lockfile with the proving path as a chain
(`debug@4.4.2 ←DEPENDS_ON← agent-base@6.0.2 ←RESOLVED← lockfile`), commit sha and time, and the
reachability note (files scanned, imports found).

## Export and share a report

[Live: the print view](/incident/{{stat:advisory.key}}?print=1) · [Markdown](/incident/{{stat:advisory.key}}/export?format=md) · [Slack text](/incident/{{stat:advisory.key}}/export?format=slack) · [JSON](/incident/{{stat:advisory.key}}/export?format=json).

**Export PDF** in the report header prints the report as a paper document: a light print palette
(the same tokens, redefined for paper), an A4 flow with a title block (advisory, kind, severity,
worst verdict, published, generated, engine digest), every "How HydraDB answered this" statement
open as a light code block, every capped table fully expanded, the stat strip on one row, the
blast graph and timeline scaled to the page width, and a provenance line at the end. The sidebar,
rail, buttons and "Beyond the watched set" are left out. Save as PDF from the dialog — the file
name is proposed as `reachable-<advisory>-report.pdf`. Opening a report with `?print=1` puts it
in the same expanded state on load, so a link can be shared or printed with Ctrl/Cmd+P.

**Share** opens a small menu next to it:

| action | what you get |
|---|---|
| Copy for Slack | mrkdwn — bold headings, bullets, code spans, the six headline numbers, Q1–Q6 in short lists (`… +N more` when capped), the link |
| Copy for Discord | Markdown subset under Discord's 2 000-character limit — the same story, lists truncated honestly |
| Copy Markdown / Download .md | GitHub-flavoured Markdown: tables for every question, each executed statement in a collapsible block, provenance |
| Download .json | the committed report itself (`worker/out/<advisory>.json`) |
| Copy link · Copy print link | the report URL, or the `?print=1` variant |

The same formats are served at `/incident/<advisory>/export?format=md|slack|discord|txt|json`
(add `&download=1` for an attachment). Every number and statement in every format is read from
the same JSON the page renders; nothing is re-typed. Pasting a report link into Slack, Discord or
X unfurls a card for that incident (advisory, summary, the six numbers, the worst verdict).

## Ask

[Live: Ask](/ask).


Type a question on **Ask**, or click one of the suggested shapes. There is no language model:
the question is matched against a small grammar, each shape maps to one verified statement, and
the answer is one sentence, then the rows, then the statement that produced them. Identifiers are
recognised by shape — advisory ids (`MAL-`, `GHSA-`, `CVE-`), `owner/repo`, `package@version`,
bare package names including `@scope/name`. If a question does not parse, the page tells you the
shapes it knows; an empty result renders a grey `none` chip with an honest sentence. The full
grammar is in [Ask grammar](/docs/reference/ask).

## Board

[Live: Board](/board).

Five lanes — Act now · Resolved while live · Imported · Unscanned · Present only. Lanes are
**computed from the data**, not assigned: a card moves only when the graph changes. The compact
toggle drops the detail lines.

## Beyond the watched set

[Live: the section at the end of the report](/incident/{{stat:advisory.key}}#beyond).

At the bottom of every report, a GitHub code search for public repositories whose lockfile pins
an affected version today, with a **watch** button per row. These are candidates, not verdicts:
watching one runs the four steps above, and only then does the service get a verdict.

## Coding agents

`worker/reachable/mcp_server.py` exposes twelve tools over stdio; it relays to the worker API, so
`make up` first. Claude Code picks it up from the repo's `.mcp.json`; Codex, OpenCode, Cursor and
Copilot take the same command and arguments (see [Running it](/docs/reference/run)). Every answer
carries the Cypher that produced it under `cypher` and its caveats under `limitations`.

| tool | what it answers |
|---|---|
| `exposed_services` | which watched services resolved an affected version (Q1), optionally narrowed to one service |
| `resolved_while_live` | which services committed a lockfile pinning the bad version while it was installable (Q3) |
| `affected_versions` | the versions an advisory affects, first affected, removal and the window (Q2) |
| `maintainer_fanout` | maintainers of the affected packages and the other packages they publish, with resolving services (Q4) |
| `typosquats` | package names within one edit of a package (Q5); distance and kind are facts, "typosquat" is a hypothesis |
| `why_pulled_in` | the dependency chain(s) through which a service resolves a package, per lockfile |
| `who_depends_on` | which watched services pin an exact package version |
| `list_services` | the watched repositories with lockfile count and latest commit |
| `watch_repository` | start watching a repository; returns a job id |
| `job_status` | progress and log of an ingest job |
| `find_public_victims` | public repositories whose lockfile pins an affected version today — candidates, not verdicts |
| `cypher` | a read-only OpenCypher statement (`MATCH`/`CALL`/`RETURN` only; writes are refused) |

## Badge

[Live: a badge](/badge/LVQT-ss/cakestory-api.svg).

`/badge/{owner}/{repo}.svg` — a two-cell SVG for READMEs: `reachable · L2 of N` in the verdict
colour; `unscanned` in grey; `no exposure recorded` in neutral when the service is in no composed
incident (never green — absence of a record is not a clean bill). The Services table and the Q6
ledger show the markdown to paste.

## Read-only deploys and degraded states

The console can be deployed with only the committed reports: the incident pages, board and badge
work; **Services**, **Ask** and **Graph** show their degraded states instead of stale numbers.
Nothing is served from a cache that pretends to be live. When the worker is up but a request
fails, the error surfaces as a toast; unknown routes get a designed 404. Everything is reachable
by keyboard, focus rings are always visible, hit areas are at least 40 px,
`prefers-reduced-motion` turns every animation off and shows every number at its final value.
The console is dark only.

## The pages, in one line each

- **Incidents** `/incidents` — every composed advisory, sorted by act-now count; click a row for the report.
- **Report** `/incident/{advisory}` — the six questions with the executed statement on every card.
- **Service detail** `/incident/{advisory}/{owner}/{repo}` — one card per exposed lockfile with its proving path.
- **Board** `/board` — five lanes computed from the data.
- **Services** `/services` — the watched registry, add-by-URL ingest jobs, badges.
- **Ask** `/ask` — typed questions to verified statements.
- **Graph** `/graph` — live counts per label, the frozen schema, ingest jobs and a force-directed neighbourhood explorer (wheel zooms, drag pans, click opens a node panel with "ask about this").
- **Docs** `/docs` — this guide, rendered from the repo's own markdown.
