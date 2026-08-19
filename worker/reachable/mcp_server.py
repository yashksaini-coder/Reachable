"""MCP (stdio) server so coding agents can ask the graph the six questions.

Thin: every tool is one call to the running worker API (reachable.api on 127.0.0.1:8787),
which is where auth, read-only enforcement and the Cypher live. Nothing is computed here —
HydraDB answers, this relays. Register with e.g.

    claude mcp add reachable -e PYTHONPATH=worker -- .venv/bin/python -m reachable.mcp_server

or the equivalent `mcpServers` entry ({"command": ".../.venv/bin/python",
"args": ["-m", "reachable.mcp_server"], "env": {"PYTHONPATH": ".../worker"}}) in Codex,
OpenCode, Cursor, Copilot. Point REACHABLE_API_URL elsewhere if the worker is not local.
"""

from __future__ import annotations

import contextvars
import logging
import os

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

from reachable.dotenv import load_dotenv

logging.getLogger("httpx").setLevel(logging.WARNING)  # stdio transport: keep the pipes quiet

# Set per request by the hosted transport. Empty over stdio, where the process key applies.
CALLER_KEY: contextvars.ContextVar[str] = contextvars.ContextVar("caller_key", default="")
# The client launches this directly and inherits no shell exports; without this a key in .env is
# silently ignored and every tool 401s.
load_dotenv()
API = os.environ.get("REACHABLE_API_URL", "http://127.0.0.1:8787").rstrip("/")
_KEY = os.environ.get("REACHABLE_API_KEY", "").strip()
_c = httpx.Client(
    base_url=API, timeout=60, headers={"Authorization": f"Bearer {_KEY}"} if _KEY else {}
)

# Declared so a client can tell the one writing tool from the eleven that read.
_READS = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)
_WRITES = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, idempotent_hint=True, open_world_hint=True
)
# Reads the graph, but the rows come from GitHub code search — not a closed world.
_READS_EXTERNAL = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=True)

mcp = MCPServer(
    "reachable",
    instructions=(
        "Supply-chain incident response over a HydraDB dependency graph of watched GitHub "
        "repositories ('services'), their package-lock.json history, npm versions, OSV "
        "advisories and maintainers. Advisory ids look like MAL-2025-46974, GHSA-xxxx-xxxx-xxxx "
        "or CVE-2025-1234; services are owner/repo; packages are npm names. Every tool that "
        "answers a question about the graph carries the Cypher that produced it under 'cypher' "
        "and caveats under 'limitations' — repeat the limitations to the user, never round them "
        "off. The exceptions are list_services (a registry listing) and job_status / "
        "watch_repository (job state), which carry no 'cypher'. Numbers are measured, not "
        "estimated."
    ),
)


def _send(method: str, path: str, **kw) -> dict:
    """One worker call. Failures come back as readable results — a raised tool says only that
    something broke."""
    caller = CALLER_KEY.get()
    headers = {"Authorization": f"Bearer {caller}"} if caller else None
    try:
        r = _c.request(method, path, headers=headers, **kw)
    except httpx.RequestError as e:
        return {
            "error": (
                f"worker API unreachable at {API} ({e.__class__.__name__}) — start it with "
                "`make up`, or point REACHABLE_API_URL at a running worker"
            ),
            "status": 0,
        }
    # Status before parsing: a gateway answers 502/504 with HTML, which would otherwise surface as
    # a JSON decode error instead of "the worker is down".
    try:
        body = r.json()
    except ValueError:
        body = None
    if r.status_code >= 400:
        detail = body.get("error") if isinstance(body, dict) else (r.text or "").strip()[:200]
        return {"error": detail or f"HTTP {r.status_code}", "status": r.status_code}
    if body is None:
        return {"error": f"worker returned non-JSON ({r.status_code})", "status": r.status_code}
    return body


def _get(path: str, **params) -> dict:
    return _send("GET", path, params={k: v for k, v in params.items() if v is not None})


@mcp.tool(annotations=_READS)
def exposed_services(advisory: str, service: str | None = None) -> dict:
    """Which watched services resolved a version affected by this advisory (Q1), with the
    lockfile sha, commit time and the dependency it was pulled in through. Optional service
    (owner/repo) narrows to one."""
    return _get("/ask/exposed", advisory=advisory, service=service)


@mcp.tool(annotations=_READS)
def resolved_while_live(advisory: str) -> dict:
    """Which services committed a lockfile pinning the bad version while it was still
    installable on npm (Q3). Evidence classes: in_window (commit inside the live window) and
    pinned_removed (pins a version npm has since erased)."""
    return _get("/ask/while-live", advisory=advisory)


@mcp.tool(annotations=_READS)
def affected_versions(advisory: str) -> dict:
    """Which versions the advisory affects, first affected, publish time, whether npm removed
    them and the installable window (Q2)."""
    return _get("/ask/versions", advisory=advisory)


@mcp.tool(annotations=_READS)
def maintainer_fanout(advisory: str) -> dict:
    """Maintainers of the affected packages and the other packages they publish, with which
    watched services resolve those today (Q4 — exposure if the next package is compromised)."""
    return _get("/ask/maintainers", advisory=advisory)


@mcp.tool(annotations=_READS)
def typosquats(package: str) -> dict:
    """Package names within one edit of the given npm package in the ingested graph (Q5).
    Distance and kind are facts; 'typosquat' is a hypothesis."""
    return _get("/ask/typosquats", package=package)


@mcp.tool(annotations=_READS)
def why_pulled_in(service: str, package: str) -> dict:
    """The dependency chain(s) through which a watched service (owner/repo) resolves an npm
    package, per lockfile — the 'why is this in my tree' proof path."""
    return _get("/ask/pulls", service=service, package=package)


@mcp.tool(annotations=_READS)
def who_depends_on(package: str, version: str) -> dict:
    """Which watched services pin an exact npm package version in any ingested lockfile."""
    return _get("/ask/depends", package=package, version=version)


@mcp.tool(annotations=_READS)
def list_services() -> list | dict:
    """The watched repositories: key, lockfile count and latest ingested commit."""
    return _get("/services")


@mcp.tool(annotations=_WRITES)
def watch_repository(repo: str) -> dict:
    """Start watching a GitHub repository (owner/repo or URL): ingests its package-lock.json
    history into the graph as a background job. Returns the job id; poll with job_status.
    Re-running for a repository already being ingested returns the running job rather than a
    second one."""
    return _send("POST", "/services/add", json={"repo": repo})


@mcp.tool(annotations=_READS)
def job_status(job_id: str) -> dict:
    """Progress and log of an ingest job started by watch_repository."""
    return _get(f"/jobs/{job_id}")


@mcp.tool(annotations=_READS_EXTERNAL)
def find_public_victims(advisory: str) -> dict:
    """Public GitHub repos whose package-lock.json pins an affected version today (GitHub code
    search on the tarball name). Candidates to watch — not verdicts."""
    return _get("/victims", advisory=advisory)


@mcp.tool(annotations=_READS)
def cypher(query: str) -> dict:
    """Run a read-only OpenCypher statement against the graph (MATCH/CALL/RETURN only; the
    worker refuses writes). Schema: (Service)-[:HAS_LOCKFILE]->(Lockfile)-[:RESOLVED]->(Version)
    -[:VERSION_OF]->(Package); (Version)-[:DEPENDS_ON]->(Version); (Advisory)-[:AFFECTS
    {live_from, live_to}]->(Version); (Maintainer)-[:MAINTAINS]->(Package). Ids are integers;
    match on the string `key` property (pkg:npm/debug, svc:owner/repo, MAL-2025-46974)."""
    return _get("/cypher", q=query)


if __name__ == "__main__":
    mcp.run()
