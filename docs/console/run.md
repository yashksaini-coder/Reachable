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
who-depends-on, list/watch services, job status, public-victim search, read-only Cypher). It
relays to the worker API, so `make up` first.

```json
{ "mcpServers": { "reachable": { "command": ".venv/bin/python", "args": ["-m", "reachable.mcp_server"], "env": { "PYTHONPATH": "worker" } } } }
```

Claude Code picks this up from the repo's `.mcp.json`; Codex, OpenCode, Cursor and Copilot take
the same command/args.
