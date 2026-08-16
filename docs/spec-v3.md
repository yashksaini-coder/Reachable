# Blast Radius — Spec v3

**Supply chain incident response on a graph.**
Hack Hydra · Track 02A · Solo · Phase-based, start immediately

> **v3 supersedes v2.** v2 targeted the hosted `api.hydradb.com` product (BYOG,
> collections, memories, `/context/ingest`). The hackathon is built around the
> **open-source repo**, which is a different system: Rust, OpenCypher, Bolt.
> Everything below is rewritten for it. v2 is archived alongside this file.

---

## 0. What changed, in one table

| | v2 assumed (hosted API) | v3 targets (OS repo) |
|---|---|---|
| Interface | REST `/query`, `/context/ingest` | **OpenCypher** over HTTP or Bolt |
| Graph writes | `graph_payload` (BYOG) | `UNWIND` + `MERGE` batched Cypher |
| Traversal | `GET /context/relations`, hop-by-hop | **`algo.MSpaths` / `SSpaths` / `SPpaths`** |
| Scoping | `database` + `collection` | graph namespace + labels |
| Memory | first-class `type: "memory"` | model it yourself as nodes |
| Client | `hydradb-sdk` | **any Neo4j driver** (Bolt 5.x) |
| Licence | n/a | **AGPL-3.0** |
| Hosting | managed | you run `graph-node` yourself |

The single biggest gain: **native bounded path procedures.** `algo.MSpaths`
resolves many sources against many targets in one call, which is exactly the
blast-radius query. You are no longer hand-rolling BFS in Python — the traversal
genuinely runs inside HydraDB, which is what the "Best Use of HydraDB" award is
looking for.

The single biggest cost: **you now operate a Rust database.** Phase 0 exists
entirely to de-risk this.

---

## 1. Product definition

### One sentence

> When a package is compromised, Blast Radius tells you which of your services
> are exposed, which actually need action tonight, and what's likely to be hit next.

### Three surfaces (no desktop app)

| Surface | Purpose | Why not desktop |
|---|---|---|
| **Web** `blastradius.dev` | Incident console. Judges click a link. | An unsigned binary triggers Gatekeeper/SmartScreen. Judges won't install. |
| **CLI** `npx blast-radius scan` | Reads local lockfiles; checks `.claude/` and `.vscode/` for worm persistence. | Delivers the only thing desktop uniquely offers, at ~5% of the cost. |
| **Badge** `/badge/{owner}/{repo}.svg` | Distribution. Every README that adds it markets the product. | — |

Maintainers live on GitHub and in the terminal. Meeting them there *is* the
product argument, not a compromise.

### The value inversion

Everyone else ships more alerts. You ship fewer, with proof.

```
17 services exposed  ·  3 actually reachable  ·  14 safe until Monday
```

---

## 2. Track alignment — answer all six, out loud

Track 02A poses six questions. Most teams will answer 1, 2 and 6. Your score
comes from 3, 4 and 5.

| # | Question | Your mechanism | Competition |
|---|---|---|---|
| 1 | Which services are transitively exposed? | reverse closure via `MSpaths` | everyone |
| 2 | Which version introduced it? | `Advisory-[:AFFECTS]->Version` + ranges | everyone |
| 3 | **Which apps resolved the bad version while it was live?** | temporal lockfile model | **almost nobody** |
| 4 | **Which packages share maintainers/infra?** | maintainer graph | **almost nobody** |
| 5 | **Likely typosquats nearby?** | materialised `NAME_SIMILAR_TO` edges | few |
| 6 | Complete blast radius | all of the above, one view | everyone |
| ➕ | **Which of these actually need action?** | forward reachability filter | **nobody** |

Question 3 is the hardest and the most skippable — which is exactly why it's
worth the most. Build it.

### Judging criteria (published)

Technical execution · use of HydraDB and graph-native approaches · product
completeness and usability · quality of results · originality. They state
plainly that they care about working, thoughtful products over benchmark scores.

**Implication:** if forced to choose, ship the product, not the eval table.

**Second shot:** the $500 Best Use of HydraDB is judged separately and any
submission is eligible. It rewards a strong graph data model and traversal that
is hard to do relationally. §4 and §5 are written to win this specifically.

---

## 3. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  INGEST  (Python, offline)                                    │
│  npm registry · deps.dev · OSV · lockfiles · tree-sitter      │
│         ↓  batched UNWIND/MERGE Cypher over Bolt              │
├───────────────────────────────────────────────────────────────┤
│  HYDRADB graph-node  (Rust, AGPL-3.0, self-hosted)            │
│  labels + relationships · algo.MSpaths · snapshot reads       │
├───────────────────────────────────────────────────────────────┤
│  API  (Next.js route handlers, server-side only)              │
│  incident queries · precomputed JSON fallback                 │
├───────────────────────────────────────────────────────────────┤
│  SURFACES   web console · CLI · badge SVG                     │
└───────────────────────────────────────────────────────────────┘
```

### Connection

```python
from neo4j import GraphDatabase
driver = GraphDatabase.driver("neo4j://127.0.0.1:7687",
                              auth=("neo4j", TOKEN))
```

or HTTP:

```
POST http://127.0.0.1:8443/v1/graphs/default/query
Authorization: Bearer $TOKEN
X-Graph-Namespace: default
{"cell_id":"cell-0","query":"MATCH ... RETURN ...","consistency":"causal"}
```

Two read modes exist: `causal` (default hot path) and `strong` (refreshes from
object storage first, paying the freshness cost). **Use `causal` everywhere
except the "fresh incident" query**, where `strong` is the honest choice and a
nice detail to mention in the video.

### Licensing

HydraDB is AGPL-3.0. Your app runs as a **separate process** talking to it over
Bolt/HTTP, and does not link or modify HydraDB source — the standard pattern.
Licence your own repos MIT or Apache-2.0, attribute HydraDB clearly in the
README, and **ask in Discord to confirm**. Not legal advice; confirm it.

---

## 4. Data model

This is the artifact the Best-Use award judges. Make it clean.

### Labels

| Label | Key property | Other properties |
|---|---|---|
| `Package` | `name` + `ecosystem` | `downloads`, `first_published` |
| `Version` | `purl` | `version`, `published_at`, `yanked`, `malicious` |
| `Maintainer` | `login` + `ecosystem` | `account_created`, `twofa`, `email_domain` |
| `Advisory` | `id` (GHSA/CVE) | `severity`, `published_at`, `summary`, `cvss` |
| `Service` | `slug` | `name`, `repo_url`, `criticality` |
| `Lockfile` | `id` (`slug@sha`) | `committed_at`, `sha`, `path` |
| `File` | `id` (`slug:path`) | `path`, `language` |
| `Symbol` | `id` (`purl#export`) | `name` |

### Relationships

| Relationship | Shape | Source |
|---|---|---|
| `VERSION_OF` | `(Version)→(Package)` | registry |
| `DEPENDS_ON` | `(Version)→(Version)` `{range, resolved}` | deps.dev / lockfile |
| `MAINTAINS` | `(Maintainer)→(Package)` `{since}` | npm registry |
| `AFFECTS` | `(Advisory)→(Version)` | OSV |
| `VULNERABLE_SYMBOL` | `(Advisory)→(Symbol)` `{inferred:true}` | LLM from advisory prose |
| `HAS_LOCKFILE` | `(Service)→(Lockfile)` | git |
| `RESOLVED` | `(Lockfile)→(Version)` `{at}` | lockfile + commit date |
| `CONTAINS` | `(Service)→(File)` | filesystem |
| `IMPORTS` | `(File)→(Package)` `{line, since}` | tree-sitter |
| `USES_SYMBOL` | `(File)→(Symbol)` `{line}` | tree-sitter |
| `NAME_SIMILAR_TO` | `(Package)→(Package)` `{distance, kind}` | materialised |

### Two modelling decisions worth defending in the video

**1. `Lockfile` is a node, not an edge property.** This is what makes question 3
answerable. A service's exposure is not a fact — it is a fact *as of a commit*.
Modelling the lockfile as a first-class temporal node lets you ask "who resolved
the bad version during the window it was live" with a single query. A relational
schema needs a bitemporal join for the same answer.

**2. `NAME_SIMILAR_TO` is materialised at ingest, not computed at query time.**
Typosquat proximity becomes a traversable edge, so "packages one edit from a
popular package, published recently, by a new account" is one Cypher query
instead of a scan. This is the kind of thing the Best-Use award is looking for.

### ID convention — purl everywhere

```
pkg:npm/express                       Package
pkg:npm/express@4.18.2                Version
sym:npm/qs@6.11.0#parse               Symbol
svc:acme/webapp                       Service
lock:acme/webapp@a3f9c21              Lockfile
file:acme/webapp:src/api.ts           File
GHSA-hrpp-h998-j3pp                   Advisory
```

OSV speaks purl natively. Lock this in Phase 1 and never change it.

### Indexes — create before ingesting

```cypher
CREATE INDEX ON :Version(purl);
CREATE INDEX ON :Package(name);
CREATE INDEX ON :Maintainer(login);
CREATE INDEX ON :Advisory(id);
CREATE INDEX ON :Service(slug);
```

`algo.MSpaths` resolves sources by **indexed** property lookup. Without these it
either fails or crawls. Verify exact index syntax against the repo's OpenCypher
subset in Phase 0.

---

## 5. The six queries

> Treat every snippet as a **draft to verify in Phase 0**. The repo supports a
> practical OpenCypher subset, and procedure argument names (especially
> `relDirection`) must be checked against the running server before you build on
> them.

### Q1 · Reverse closure — who is exposed

```cypher
CALL algo.MSpaths({
  sourceLabel: 'Version',
  sourceProperty: 'purl',
  sourceValues: $compromised_purls,
  targetLabel: 'Version',
  targetProperty: 'purl',
  targetValues: $service_root_purls,
  pairwise: false,
  relTypes: ['DEPENDS_ON'],
  relDirection: 'incoming',
  maxLen: 10,
  pathCount: 3,
  resultLimit: 1000
})
YIELD path
RETURN path
```

One call for 42 compromised packages against 200 services. The README is
explicit that this avoids client-side query fan-out — say that in the video.

Plain-Cypher fallback if the procedure fights you:

```cypher
MATCH (bad:Version)
WHERE bad.purl IN $compromised_purls
MATCH p = (bad)<-[:DEPENDS_ON*1..8]-(root:Version)<-[:RESOLVED]-(lf:Lockfile)
          <-[:HAS_LOCKFILE]-(s:Service)
RETURN s.slug AS service, length(p) AS hops, bad.purl AS via
ORDER BY hops ASC
```

### Q2 · Which version introduced it

```cypher
MATCH (a:Advisory {id: $advisory})-[:AFFECTS]->(v:Version)-[:VERSION_OF]->(p:Package)
RETURN p.name, collect(v.version) AS affected,
       min(v.published_at) AS first_affected
```

### Q3 · Who resolved it while it was live ★

The differentiator. `$live_from` / `$live_to` is the compromise window.

```cypher
MATCH (bad:Version)<-[:RESOLVED {}]-(lf:Lockfile)<-[:HAS_LOCKFILE]-(s:Service)
WHERE bad.purl IN $compromised_purls
  AND lf.committed_at >= $live_from
  AND lf.committed_at <= $live_to
RETURN s.slug, lf.sha, lf.committed_at
ORDER BY lf.committed_at
```

Then the transitive version — services that resolved it *indirectly* in the
window — by combining with the Q1 path and filtering on `lf.committed_at`.

**Why this is hard for others:** it needs lockfiles modelled as time-stamped
nodes from the start. Teams that model `Service-[:DEPENDS_ON]->Version` directly
cannot retrofit it.

### Q4 · Maintainer blast radius ★

```cypher
MATCH (bad:Version {purl: $purl})-[:VERSION_OF]->(:Package)<-[:MAINTAINS]-(m:Maintainer)
MATCH (m)-[:MAINTAINS]->(other:Package)<-[:VERSION_OF]-(ov:Version)
OPTIONAL MATCH (ov)<-[:DEPENDS_ON*1..8]-(:Version)<-[:RESOLVED]-(:Lockfile)
               <-[:HAS_LOCKFILE]-(s:Service)
RETURN m.login, m.twofa, other.name,
       count(DISTINCT s) AS services_at_risk
ORDER BY services_at_risk DESC
```

This converts the tool from forensic to **predictive**: not what was hit, but
what is likely next. Very few teams will build it, and npm's registry API hands
you maintainers for free.

### Q5 · Typosquat proximity ★

```cypher
MATCH (popular:Package)-[sim:NAME_SIMILAR_TO]->(suspect:Package)
WHERE popular.downloads > 1000000
  AND sim.distance <= 2
MATCH (suspect)<-[:VERSION_OF]-(v:Version)
MATCH (suspect)<-[:MAINTAINS]-(m:Maintainer)
WHERE v.published_at > $recent
  AND m.account_created > $recent
RETURN suspect.name, popular.name, sim.distance, sim.kind,
       v.published_at, m.login
ORDER BY sim.distance ASC, v.published_at DESC
```

Generate `NAME_SIMILAR_TO` at ingest for the top ~2,000 packages by downloads:
edit distance ≤2, plus keyboard-adjacency and separator swaps
(`node-fetch` ↔ `nodefetch`, `-` ↔ `_`). Store `kind` so the UI can explain *why*
two names are close.

### Q6 · Complete blast radius

The union, rendered as one incident page. Not a separate query — a view.

### Q7 · Reachability filter — the differentiator on top ★

```cypher
MATCH (a:Advisory {id: $advisory})-[:VULNERABLE_SYMBOL]->(sym:Symbol)
MATCH (s:Service {slug: $slug})-[:CONTAINS]->(f:File)-[:USES_SYMBOL]->(sym)
RETURN f.path, sym.name, 'L2' AS level
```

Levels: **L0** present in lockfile, never imported → deprioritise · **L1**
imported, vulnerable symbol unreferenced → low risk · **L2** symbol referenced →
act now.

State the limits in the UI: static import/symbol analysis on JS/TS only; dynamic
`require()`, re-export chains and reflection unresolved; `VULNERABLE_SYMBOL`
edges are LLM-inferred and marked as such. **Honest scoping is a credibility
asset with infra judges.** Overclaiming static analysis is the fastest way to
lose one.

---

## 6. Data sources

| Source | Gives you | Notes |
|---|---|---|
| `registry.npmjs.org/{pkg}` | versions, **maintainers**, `time` map | The `time` map is your temporal backbone — a publish timestamp per version. Free, no auth. |
| `api.deps.dev/v3/...` | resolved dependency graphs | Biggest shortcut available. Skips lockfile-resolution logic. |
| `api.osv.dev/v1/querybatch` | advisories by purl | Free, no auth, purl-native. |
| `package-lock.json` | exact resolved tree per service | **v3 lockfiles only.** Verify your chosen repos before committing. |
| git log | `committed_at` per lockfile | Powers Q3. |
| tree-sitter | imports, symbol uses | Q7 only. |

### Ingestion scope — bounded on purpose

Do **not** ingest all of npm. Seed set:

- **6–8 real services** (public repos with `package-lock.json`) sharing ≥1
  transitive dependency
- their **full transitive closure** — typically 500–2,000 versions
- **maintainers** for every package touched
- **all advisories** matching any version present
- **top ~2,000 packages by downloads** for typosquat comparison (name + download
  count only — no dependency expansion)

Realistic total: **10k–40k nodes, 30k–120k edges.** Fast to load, easy to reason
about, and you can state measured throughput plus an honest extrapolation to
"tens of millions" rather than faking scale.

### Write pattern

```cypher
UNWIND $rows AS row
MERGE (v:Version {purl: row.purl})
  ON CREATE SET v.version = row.version, v.published_at = row.published_at
MERGE (p:Package {name: row.name, ecosystem: row.ecosystem})
MERGE (v)-[:VERSION_OF]->(p)
```

Batched `UNWIND` writes are explicitly supported. Batch 500–2,000 rows per
statement; tune once, in Phase 2. `MERGE` makes re-runs idempotent.

---

## 7. Phases

Each phase: **goal · done when · cut if late.** Phases 0–4 plus 9 are a complete,
submittable product. Everything else is upside.

Rough estimate ~45–55 focused hours. Track actual hours against estimates after
Phase 1 and re-plan if you're running >30% over.

---

### Phase 0 · Prove the engine runs 🔴 BLOCKING
**~3–5 h · start now**

Nothing else matters until this is green.

- [ ] Clone `github.com/hydra-db/hydradb`, `just native-check`, `just smoke`
- [ ] Run `graph-node` locally; round-trip a write and a read over HTTP
- [ ] Connect via Python `neo4j` driver over Bolt
- [ ] **Run `algo.MSpaths` on a 10-node toy graph** — confirm exact argument
      names, especially `relDirection` (README shows `'both'`; verify
      `'incoming'`/`'outgoing'`)
- [ ] Confirm `CREATE INDEX` syntax and bounded var-length paths (`*1..8`)
- [ ] Time 1,000 `UNWIND MERGE` rows
- [ ] Create the fresh public repo, **OSS licence in the first commit**

**Known footguns:** `RUST_MIN_STACK=33554432` or the node serves `/readyz` then
aborts on the first query · macOS needs `brew install cleishm/neo4j/libcypher-parser`
(plain name fails) · `CLOUD_PROVIDER=local` also needs `LOCAL_PATH` pointing at
an existing directory · a listening port is not proof it works, a round-tripped
write is.

**Done when:** a Python script writes a graph, runs `MSpaths`, and prints a path.

**If `MSpaths` won't cooperate:** fall back to bounded var-length Cypher
(`*1..8`). Note it and move on — do not burn a second day here.

---

### Phase 1 · Lock the model
**~3–4 h**

- [ ] Write `schema.cypher`: all indexes + constraints
- [ ] Hand-write a 30-node fixture covering every label and relationship
- [ ] Write Q1–Q5 against the fixture; **verify each returns correct results by hand**
- [ ] Freeze the ID convention

**Done when:** all five queries return hand-verified correct answers on the fixture.

**Why before ingestion:** a schema mistake found here costs an hour; found after
ingestion it costs a day. This phase is the whole reason to resist writing the
pipeline first.

---

### Phase 2 · Ingestion
**~6–8 h**

- [ ] `npm_client.py` — versions, maintainers, `time` map, downloads
- [ ] `depsdev_client.py` — transitive dependency graph
- [ ] `osv_client.py` — advisories by purl batch
- [ ] `lockfile.py` — parse `package-lock.json` + `git log` for `committed_at`
- [ ] `typosquat.py` — materialise `NAME_SIMILAR_TO` over top ~2,000 packages
- [ ] `load.py` — batched `UNWIND MERGE`, resumable, idempotent
- [ ] On-disk HTTP cache (`requests-cache` or hand-rolled) — you will re-run this
      many times and registry calls are the slow part

**Done when:** `python -m ingest --seed seeds.yaml` builds the full graph from
cold in under ~20 minutes, and re-running changes nothing.

**Cut if late:** drop typosquat ingestion to top 500 packages.

---

### Phase 3 · The six answers
**~4–6 h**

- [ ] `queries.py` — one function per question, parameterised, typed results
- [ ] An `Incident` object composing all six into one payload
- [ ] **Measure and record p50/p95 latency for Q1** — this is your 09:00→09:06 number
- [ ] Golden-file tests for each query against the seed graph

**Done when:** `python -m incident GHSA-xxxx` prints the complete blast radius,
with timings.

This phase *is* the project. If everything after it were cut, you would still
have something defensible.

---

### Phase 4 · Web console
**~8–10 h**

Next.js + Tailwind + shadcn/ui. Three routes only:

| Route | Contents |
|---|---|
| `/` | Landing, the pitch, gallery of pre-loaded incidents |
| `/incident/{advisory}` | The six answers as one page: exposed services list, hop counts, temporal window, maintainer fan-out, typosquat neighbours |
| `/incident/{advisory}/{service}` | Path detail + reachability verdict |

**Design the incident page around the path**, rendered as stacked cards:

```
GHSA-hrpp-h998-j3pp   HIGH   live 2026-02-14 → 2026-02-16

  17 services exposed   ·   3 reachable   ·   14 safe until Monday

  acme/webapp                                    REACHABLE
    qs@6.11.0 → express@4.18.2 → acme/webapp     3 hops
    resolved 2026-02-15 09:41  ← inside the live window
    src/api.ts:42 calls qs.parse

  acme/worker                                    not reachable
    qs@6.11.0 → body-parser → acme/worker        4 hops
    present in lockfile, never imported
```

Server-side calls only — the auth token must never reach the browser, and
`NEXT_PUBLIC_`-prefixed vars are bundled into client JS.

**Cut if late:** the force-directed graph explorer. It is the most tempting and
least necessary thing on this list.

---

### Phase 5 · Sharpen the differentiators
**~5–7 h**

- [ ] Temporal window UI — a timeline showing when each service resolved the bad
      version relative to the compromise window. **The single most visual proof
      of Q3.**
- [ ] Maintainer fan-out panel: "also maintains 23 packages, you depend on 4"
- [ ] Typosquat panel with `kind` explaining the similarity
- [ ] Use `consistency: "strong"` on the fresh-incident query and say why

---

### Phase 6 · Reachability filter
**~4–6 h**

- [ ] tree-sitter JS/TS extraction of imports + symbol uses
- [ ] LLM extraction of `VULNERABLE_SYMBOL` from advisory prose, tagged `inferred`
- [ ] L0/L1/L2 verdicts surfaced in the UI
- [ ] Explicit limitations panel

**Cut if late:** ship L0/L1 only (lockfile presence + import). Still gives you
"14 safe until Monday," which is the headline.

---

### Phase 7 · CLI + badge
**~3–4 h**

- [ ] `npx blast-radius scan` — reads local `package-lock.json`, POSTs the
      dependency set, prints the verdict table
- [ ] Local worm check: flag suspicious persistence in `.claude/` and `.vscode/`
- [ ] `/badge/{owner}/{repo}.svg` → `reachable alerts · 2 of 17`

**The badge is ~1 hour and the highest ROI item in the whole spec.** Do not cut it.

---

### Phase 8 · Deploy + harden
**~4 h**

- [ ] `graph-node` on a small VM (Hetzner/DO, ~$5/mo), `CLOUD_PROVIDER=local`
- [ ] Caddy in front for TLS — **TLS is required by default in deployed
      environments**; plaintext must be explicitly enabled, so don't ship
      plaintext to the internet
- [ ] Firewall: only the Next.js origin reaches the node
- [ ] Next.js on Vercel + custom domain
- [ ] **Precomputed JSON fallback** for every gallery incident, so the demo
      survives the database being down
- [ ] Rate limit `/api/ask` (Upstash), hard LLM spend cap, `LIVE_FEATURES` kill switch
- [ ] UptimeRobot on `/api/health`

**Demo rule:** the gallery path must render from committed JSON with zero live
dependencies. Live queries are for the *speed* demo, not the *whole* demo.

---

### Phase 9 · Submission 🔴 RESERVE THIS TIME
**~3 h · non-negotiable, do it a full day before the deadline**

- [ ] **Video ≤ 3:00.** Anything past three minutes may not be reviewed. Script it.
- [ ] README: problem · architecture · data model diagram · **exactly how
      HydraDB is used** · measured numbers · limitations · attribution
- [ ] Verify the repo has: complete source, clear README, setup instructions,
      env/dependency info, third-party attribution, OSS licence, **no commits
      before Aug 12**
- [ ] Submission form: name, description, problem, what you built, deployed link,
      how it uses the HydraDB OS repo, tech stack, contributions, repo, video
- [ ] **Open every link yourself in a private window.** Broken links are
      explicitly called out as the most common way people lose.

### Video script (3:00)

| Time | Beat |
|---|---|
| 0:00–0:20 | The problem. 84 malicious artifacts across 42 packages in six minutes. Defenders need answers in minutes. |
| 0:20–0:35 | What you built, one sentence, and the three surfaces. |
| 0:35–1:50 | **Live demo.** Trigger an incident → exposed services appear with hop counts and latency on screen → temporal window → maintainer fan-out → reachability filter cuts 17 to 3. |
| 1:50–2:30 | **The graph model.** Show the schema. Explain why `Lockfile` is a node and why `MSpaths` replaces client-side fan-out. This is the Best-Use pitch. |
| 2:30–2:50 | Scale: measured node count, measured Q1 latency, honest extrapolation. |
| 2:50–3:00 | Limitations, licence, link. |

---

## 8. Cut order

When you fall behind — and you will — cut in this order:

1. Force-directed graph explorer
2. Eval harness (they said products over benchmarks)
3. Reachability L2 (keep L0/L1)
4. CLI worm check (keep the scan)
5. Typosquat panel (keep the ingestion, hide the UI)
6. Live follow-up chat

**Never cut:** Phase 0, the six queries, the incident page, the badge, Phase 9.

---

## 9. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| **HydraDB won't build locally** | **High** | Phase 0 is first. Docker/MinIO path (`just minio-smoke`) as fallback. If blocked >5h, ask in Discord immediately — the team runs office hours all nine days. |
| `algo.MSpaths` args differ from README | Medium | Verified in Phase 0; bounded var-length Cypher fallback |
| Chosen repos lack `package-lock.json` | **High** | Verify all 6–8 in Phase 0 before committing. pnpm/yarn will break the parser. |
| OpenCypher subset missing a feature you need | Medium | It's a *practical subset* — test each query shape in Phase 1 on the fixture, not in Phase 3 on real data |
| Deployment of a Rust DB eats a day | Medium | Precomputed JSON means the demo works without it |
| Solo burnout | **High** | Phases 5–7 are cuttable by design. Sleep before Phase 9, not during. |
| Scope creep (desktop app, more ecosystems, auto-fix PRs) | **Very high** | Re-read §1 |

---

## 10. Right now — next four hours

1. `git clone https://github.com/hydra-db/hydradb && just native-check && just smoke`
2. Read the repo's own `AGENTS.md` and `CLAUDE.md` — these differ from
   `docs.hydradb.com`, which documents the *hosted* product. Point your coding
   agent at the repo's versions.
3. Create the fresh public repo; first commit contains the licence and a README stub.
4. Join `discord.gg/D8cGSa9H9` and ask two questions: (a) does the hosted API
   count or is the OS repo expected, (b) AGPL boundary for a separate-process app.
5. Pick and verify 6–8 seed repos — **confirm each has `package-lock.json`.**

---

## Appendix — quick reference

```
Repo        github.com/hydra-db/hydradb          (AGPL-3.0, Rust 1.91+)
Bolt        neo4j://127.0.0.1:7687               Neo4j drivers, Bolt 5.x
HTTP        127.0.0.1:8443/v1/graphs/{g}/query   JSON + NDJSON
Admin       127.0.0.1:9090/readyz  /metrics
Health      /healthz on the public server
Procedures  algo.SPpaths  algo.SSpaths  algo.MSpaths
Consistency causal (default) | strong (refresh from object store first)
Checks      just native-check · just smoke · just minio-smoke
Discord     discord.gg/D8cGSa9H9
Submit      forms.gle/WEwqEmmN7Bkp4HyJ6      Aug 20, 11:59 PM PT
Data        registry.npmjs.org · api.deps.dev · api.osv.dev
```

**Env for a local node:** `CLOUD_PROVIDER=local` · `LOCAL_PATH` (must exist) ·
`GRAPH_NAMESPACE` · `GRAPH_ID` · `GRAPH_CELL_ID` · `GRAPH_CELLS` ·
`GRAPH_NODE_ID` · `GRAPH_BOLT_NODE_ADDRESSES` · `GRAPH_ADVERTISED_BOLT_ADDR` ·
`GRAPH_DATA_CACHE_DIR` · `GRAPH_AUTH_TOKEN_FILE` · `GRAPH_ALLOW_PLAINTEXT=true`
(local only) · **`RUST_MIN_STACK=33554432`**

**Disqualifiers:** commits before Aug 12 · private repo · no OSS licence · no
demo video · HydraDB not used meaningfully · late submission.
