# The console

The console reads two things: the **committed incident reports** (`worker/out/*.json`, rendered
statically, always available) and the **live worker API** (`:8787`, which talks to HydraDB). Pages
that need the worker degrade on purpose when it is down — they say so, they never guess.

## Incidents — `/incidents`

Every composed advisory, sorted by act-now count: id, worst verdict across its services, kind and
severity, one-line description, and a metadata line (exposed · while live · act now · unscanned ·
published · cold/warm latency drawn as a small sparkline). Click a row for the report.

## The report — `/incident/{advisory}`

Top to bottom: the header and headline sentence · a six-stat strip · the **blast radius** graph
(version → dependency → lockfile → service, amber where the lockfile resolved while installable)
· **Q1** verdicts (distribution bar + service table) · **Q2** versions with the `upper bound`
chip · **Q3** the installable-window timeline and evidence table · **Q4** maintainer reach ·
**Q5** look-alike names by kind · **Q6** the ledger, with the command that regenerates the report
and the README badge · **Beyond the watched set** — a GitHub code search for public repositories
whose lockfile pins an affected version today, with a `watch` button per row · provenance.

The right rail is a mini-map: it tracks the section in view and jumps between them.

## Service detail — `/incident/{advisory}/{owner}/{repo}`

One card per exposed lockfile of that service: the **proving path** as a chain
(`debug@4.4.2 ←DEPENDS_ON← agent-base@6.0.2 ←RESOLVED← lockfile`), commit sha and time, and the
reachability note (files scanned, imports found).

## Board — `/board`

Five lanes — Act now · Resolved while live · Imported · Unscanned · Present only. Lanes are
**computed from the data**, not assigned: a card moves only when the graph changes. The compact
toggle drops the detail lines.

## Services — `/services`

Add a repository by `owner/repo` or GitHub URL. The job runs in the worker: read the lockfile
commits, walk them, enrich versions from the registry, link advisories from OSV, scan imports at
the latest commit. Progress streams into the job card; the table below is the watched registry
with cohort, lockfile count, latest commit, incidents and the badge. When the worker is down the
page shows a degraded state instead of stale numbers.

## Ask — `/ask`

Type a question; see [Ask](/docs/ask) for what the grammar understands. Each answer is one
sentence, then the rows, then the statement that produced them.

## Graph — `/graph`

Live counts per label, the frozen schema, ingest jobs, and an explorer: pick a service or an
advisory, get its bounded neighbourhood laid out with a force simulation. Wheel zooms, drag pans,
click opens a node panel with an "ask about this" action.

## Keyboard and access

Everything is reachable by keyboard; focus rings are always visible; hit areas are at least 40 px;
`prefers-reduced-motion` turns every animation off and shows every number at its final value.
The console is dark only.
