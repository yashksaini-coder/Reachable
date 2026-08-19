# Running it

Two shells. `graph-node` (HydraDB) runs in the foreground and does not return — that is it
working, not hanging.

```bash
cp .env.example .env            # HYDRA_TOKEN (any 32+ byte string for a local node), GITHUB_TOKEN
make venv                       # python venv + requirements.txt
make node                       # shell 1: HydraDB via Docker, stays in the foreground
make node-test && make test     # shell 2: golden tests on a throwaway node (:17687), lint, leak check
make up                         # worker API :8787 (background) + web build + console :3000
make add REPO=owner/repo        # ingest one repository (or use Services → add repository)
make demo                       # replays demo/services.txt then demo/incidents.txt
make incident ID=MAL-2025-46974 ARGS="--out --runs 5"   # (re)compose one report → worker/out + benchmarks/results
make mcp                        # MCP stdio server for coding agents
make down                       # stop the worker API
```

Requirements: Docker, Python 3.11+ (developed on 3.14), Node 20+. `web/.env.local` mirrors
`.env` for the console's server-only routes; nothing is ever exposed to the browser.

## Ports

| port | what |
|---|---|
| 7687 | HydraDB Bolt (the worker's only way in) |
| 8443 · 9090 | HydraDB HTTP · admin (`/readyz`) |
| 8787 | worker API (loopback; the console proxies to it server-side) |
| 3000 | the console |
| 17687 | the throwaway test node used by `make test` |

## Read-only deploys

The console can be deployed with only the committed reports (`worker/out/*.json`): the incident
pages, board and badge work; Services, Ask and Graph show their degraded states. Nothing is served
from a cache that pretends to be live.

## The badge

`/badge/{owner}/{repo}.svg` — a two-cell SVG: `reachable · L2 of N` in the verdict colour;
`unscanned` in grey; `no exposure recorded` in neutral when the service is in no composed
incident (never green — absence of a record is not a clean bill).

## MCP for coding agents

`worker/reachable/mcp_server.py` exposes twelve tools over stdio (the six questions, proof paths,
who-depends-on, list/watch services, job status, public-victim search, read-only Cypher) using the
official Python SDK. It computes nothing: each tool is one call to the worker API, which is where
auth, read-only enforcement and the Cypher live.

```json
{ "mcpServers": { "reachable": {
  "command": ".venv/bin/python",
  "args": ["-m", "reachable.mcp_server"],
  "env": { "PYTHONPATH": "worker",
           "REACHABLE_API_URL": "${REACHABLE_API_URL:-http://127.0.0.1:8787}",
           "REACHABLE_API_KEY": "${REACHABLE_API_KEY:-}" }
} } }
```

Claude Code picks this up from the repo's `.mcp.json`; Codex, OpenCode, Cursor and Copilot take the
same command, args and env.

**Against a local worker** — `make up` first, then nothing else: the default URL is loopback and a
local worker needs no key.

**Against a deployed worker** — set both variables before launching the client:

```bash
export REACHABLE_API_URL=https://api.<ip>.sslip.io
export REACHABLE_API_KEY=…        # from deploy/.env on the VM
```

Four things that are easy to get wrong:

- The key may live in `.env` (the server reads it from there) **or** in the client's `env` block.
  What does not work is relying on a shell export when the client is launched from a desktop app
  that inherits no shell environment.
- Paths in `.mcp.json` are relative, so the client must start from the repository root.
- The local virtualenv is needed only for `mcp` and `httpx` — no graph driver, no HydraDB. All the
  computation happens on the worker.
- Without a key against a worker that wants one, every tool returns
  `missing or invalid API key` as a normal result rather than failing the call.

### Verifying it

`worker/tests/test_mcp.py` asserts the contract without needing a worker: twelve tools, every one
described, `watch_repository` marked as the only mutating tool, and the `cypher` tool shipping the
graph schema. `scripts/mcp_smoke.py` goes further — it drives the server as a real MCP client and
calls every read-only tool against whatever `REACHABLE_API_URL` points at:

```
$ REACHABLE_API_URL=https://api.<ip>.sslip.io REACHABLE_API_KEY=… .venv/bin/python scripts/mcp_smoke.py
12 tools advertised: affected_versions, cypher, exposed_services, find_public_victims, job_status,
list_services, maintainer_fanout, resolved_while_live, typosquats, watch_repository,
who_depends_on, why_pulled_in

 ok   list_services          16 rows
 ok   exposed_services       6 rows · 6028.8 ms · cypher[9] · limitations[1]
 ok   affected_versions      1 rows · 14.0 ms · cypher[2] · limitations[1]
 ok   resolved_while_live    6 rows · 41.1 ms · cypher[2] · limitations[1]
 ok   maintainer_fanout      32 rows · 5040.3 ms · cypher[11] · limitations[3]
 ok   typosquats             2 rows · 27.5 ms · cypher[1] · limitations[1]
 ok   who_depends_on         6 rows · 16.1 ms · cypher[1] · limitations[1]
 ok   why_pulled_in          53 rows · 16306.5 ms · cypher[7] · limitations[1]
 ok   find_public_victims    30 rows · cypher[2] · limitations[1]
 ok   cypher                 3 rows · 7.3 ms · cypher[1] · limitations[1]
 ok   job_status             error: no such job
all read-only tools answered (0 unexpected)
```

`watch_repository` is listed but never called by the smoke run — it would write to the graph. The
`job_status` line is an expected failure: the script asks for a job id that does not exist to prove
errors come back as readable results rather than as a crashed tool.
