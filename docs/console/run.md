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

Twelve tools — the six questions, proof paths, who-depends-on, list/watch services, job status,
public-victim search, read-only Cypher — over the Model Context Protocol. Nothing is computed in the
server: each tool is one call to the worker API, which is where auth, read-only enforcement and the
Cypher live.

### Connecting to the deployed worker

Nothing to clone, nothing to install. [Generate a key](/keys), then point your client at the
endpoint. Claude Code:

```bash
claude mcp add --transport http reachable https://api.<ip>.sslip.io/mcp \
  --header "Authorization: Bearer rk_your_key"
```

Any client that speaks HTTP MCP takes the same two facts — a URL and a header:

```json
{
  "mcpServers": {
    "reachable": {
      "type": "http",
      "url": "https://api.<ip>.sslip.io/mcp",
      "headers": {
        "Authorization": "Bearer rk_your_key"
      }
    }
  }
}
```

The key you generate is read-only, expires after 7 days, is rate-limited to 5 an hour per client and
is stored only as a sha256 digest. You can end one early from the same page — **Revoke** on the key
card, or `DELETE /keys` with the key itself as the bearer token, since holding it is the proof it is
yours to revoke. A revoked key stops authenticating on the next request, over HTTP MCP as well as
over the API. Revoking does not refund the hourly minting budget. It reads the graph and cannot write: `watch_repository` is the one
tool that writes, and a read-only key is refused on it. The hosted server holds no authority of its
own — it relays each call with *your* key, so the same guard that protects the API decides.

Only Claude Code has been driven end to end this way. The others take the identical HTTP contract,
which is a reason to expect them to work and not the same as having run them.

### Running it against your own worker

If you have the repo, `make up` and the stdio server needs no key at all — the default URL is
loopback and a local worker asks for none. The tools then answer against *your* graph, the
repositories you watched:

```json
{
  "mcpServers": {
    "reachable": {
      "command": ".venv/bin/python",
      "args": ["-m", "reachable.mcp_server"],
      "env": {
        "PYTHONPATH": "worker",
        "REACHABLE_API_URL": "http://127.0.0.1:8787"
      }
    }
  }
}
```

Claude Code picks that up from the repo's own `.mcp.json`. Paths in it are relative, so the client
must start from the repository root, and the virtualenv is needed only for `mcp` and `httpx` — no
graph driver, no HydraDB in the client.

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

 ok   list_services          17 rows
 ok   exposed_services       6 rows · 28.0 ms · cypher[9] · limitations[1]
 ok   affected_versions      1 rows · 8.7 ms · cypher[2] · limitations[1]
 ok   resolved_while_live    6 rows · 21.7 ms · cypher[2] · limitations[1]
 ok   maintainer_fanout      32 rows · 2770.4 ms · cypher[11] · limitations[3]
 ok   typosquats             2 rows · 9.5 ms · cypher[1] · limitations[1]
 ok   who_depends_on         6 rows · 13.8 ms · cypher[1] · limitations[1]
 ok   why_pulled_in          53 rows · 7964.4 ms · cypher[7] · limitations[1]
 ok   find_public_victims    30 rows · cypher[2] · limitations[1]
 ok   cypher                 3 rows · 5.5 ms · cypher[1] · limitations[1]
 ok   job_status             error: no such job
all read-only tools answered (0 unexpected)
```

`watch_repository` is listed but never called by the smoke run — it would write to the graph. The
`job_status` line is an expected failure: the script asks for a job id that does not exist to prove
errors come back as readable results rather than as a crashed tool.

`scripts/mcp_http_smoke.py` does the same over the hosted transport, as a client with no clone would:
it drives `https://<host>/mcp` with a minted key and then calls `watch_repository`, which must come
back 401 — the relay carries the caller's key, so a read-only key stays read-only across the hop.

```
$ REACHABLE_MCP_URL=https://api.<ip>.sslip.io/mcp REACHABLE_API_KEY=rk_… .venv/bin/python scripts/mcp_http_smoke.py
12 tools advertised: affected_versions, cypher, exposed_services, find_public_victims, job_status,
list_services, maintainer_fanout, resolved_while_live, typosquats, watch_repository,
who_depends_on, why_pulled_in

  ok   exposed_services  6 rows · cypher[9]
  ok   watch_repository  missing or invalid API key

scope survived the hop
```
