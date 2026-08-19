"""Drive the MCP server as a real client and print what each tool answered.

Proof that the twelve tools work over stdio against whatever REACHABLE_API_URL points at — a
local worker or the deployed one. The contract itself is asserted in worker/tests/test_mcp.py;
this exercises the whole path, including auth and the network.

    make up                                              # local
    .venv/bin/python scripts/mcp_smoke.py

    REACHABLE_API_URL=https://api.<ip>.sslip.io \
    REACHABLE_API_KEY=… .venv/bin/python scripts/mcp_smoke.py

Read-only: watch_repository is listed but never called — it would write to the graph.
"""

from __future__ import annotations

import json
import os
import sys

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ADVISORY = os.environ.get("SMOKE_ADVISORY", "MAL-2025-46974")
API = os.environ.get("REACHABLE_API_URL", "http://127.0.0.1:8787")

# (tool, arguments) — every read-only tool, in the order a responder would actually use them.
CALLS: list[tuple[str, dict]] = [
    ("list_services", {}),
    ("exposed_services", {"advisory": ADVISORY}),
    ("affected_versions", {"advisory": ADVISORY}),
    ("resolved_while_live", {"advisory": ADVISORY}),
    ("maintainer_fanout", {"advisory": ADVISORY}),
    ("typosquats", {"package": "debug"}),
    ("who_depends_on", {"package": "debug", "version": "4.4.2"}),
    ("why_pulled_in", {"service": "koajs/koa", "package": "debug"}),
    ("find_public_victims", {"advisory": ADVISORY}),
    ("cypher", {"query": "MATCH (s:Service) RETURN s.name AS name LIMIT 3"}),
    ("job_status", {"job_id": "does-not-exist"}),  # exercises the error path on purpose
]


def _payload(result) -> dict | list:
    if getattr(result, "structured_content", None):
        sc = result.structured_content
        return sc.get("result", sc) if isinstance(sc, dict) else sc
    for block in result.content:
        text = getattr(block, "text", None)
        if text:
            try:
                return json.loads(text)
            except ValueError:
                return {"text": text[:200]}
    return {}


def _summarise(name: str, body) -> str:
    if isinstance(body, list):
        return f"{len(body)} rows"
    if not isinstance(body, dict):
        return str(body)[:80]
    if "error" in body:
        return f"error: {body['error']}"[:110]
    rows = body.get("rows")
    n = len(rows) if isinstance(rows, list) else None
    bits = [f"{n} rows" if n is not None else "ok"]
    if body.get("ms") is not None:
        bits.append(f"{body['ms']:.1f} ms")
    if body.get("cypher"):
        bits.append(f"cypher[{len(body['cypher'])}]")
    if body.get("limitations"):
        bits.append(f"limitations[{len(body['limitations'])}]")
    return " · ".join(bits)


async def main() -> int:
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "reachable.mcp_server"],
        env={**os.environ, "PYTHONPATH": "worker"},
    )
    print(f"worker: {API}\nadvisory: {ADVISORY}\n")
    failures = 0
    async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
        await session.initialize()
        tools = {t.name: t for t in (await session.list_tools()).tools}
        print(f"{len(tools)} tools advertised: {', '.join(sorted(tools))}\n")

        for name, args in CALLS:
            body = _payload(await session.call_tool(name, args))
            line = _summarise(name, body)
            expected_error = name == "job_status"
            bad = ("error" in line) is not expected_error
            failures += bad
            print(f"{'FAIL' if bad else ' ok '}  {name:22s} {line}")

        print("\ncypher returned by exposed_services:")
        body = _payload(await session.call_tool("exposed_services", {"advisory": ADVISORY}))
        for stmt in (body.get("cypher") or ["(none)"])[:1]:
            print("  " + " ".join(stmt.split())[:300])

    print(f"\n{'FAILED' if failures else 'all read-only tools answered'} ({failures} unexpected)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(anyio.run(main))
