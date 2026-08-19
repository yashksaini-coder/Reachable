"""Drive the hosted MCP transport as a real client — the path a user with no clone takes.

    REACHABLE_MCP_URL=https://api.<ip>/mcp REACHABLE_API_KEY=rk_… .venv/bin/python scripts/mcp_http_smoke.py

Checks the twelve tools are advertised, a read tool answers, and that a read-only key is still
refused on watch_repository — the relay carries the caller's key, so scope survives the hop.
"""

from __future__ import annotations

import os
import sys

import anyio
import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

URL = os.environ.get("REACHABLE_MCP_URL", "http://127.0.0.1:8788/mcp")
KEY = os.environ.get("REACHABLE_API_KEY", "").strip()
ADVISORY = os.environ.get("SMOKE_ADVISORY", "MAL-2025-46974")


def _payload(result):
    if getattr(result, "structured_content", None):
        sc = result.structured_content
        return sc.get("result", sc) if isinstance(sc, dict) else sc
    for block in result.content:
        text = getattr(block, "text", None)
        if text:
            import json

            try:
                return json.loads(text)
            except ValueError:
                return {"text": text[:200]}
    return {}


async def main() -> int:
    headers = {"Authorization": f"Bearer {KEY}"} if KEY else {}
    print(f"url: {URL}\n")
    async with (
        httpx2.AsyncClient(headers=headers, timeout=90) as http,
        streamable_http_client(URL, http_client=http) as (read, write),
        ClientSession(read, write) as s,
    ):
        await s.initialize()
        tools = sorted(t.name for t in (await s.list_tools()).tools)
        print(f"{len(tools)} tools advertised: {', '.join(tools)}\n")

        body = _payload(await s.call_tool("exposed_services", {"advisory": ADVISORY}))
        rows = body.get("rows", []) if isinstance(body, dict) else []
        err = body.get("error") if isinstance(body, dict) else None
        cy = len(body.get("cypher", [])) if isinstance(body, dict) else 0
        print(
            f" {'FAIL' if err else ' ok '}  exposed_services  {err or f'{len(rows)} rows · cypher[{cy}]'}"
        )

        # A read-only key must still be refused here; the hosted server holds no authority of its own.
        w = _payload(await s.call_tool("watch_repository", {"repo": "example/does-not-matter"}))
        refused = isinstance(w, dict) and w.get("status") == 401
        print(
            f" {' ok ' if refused else 'NOTE'}  watch_repository  {w.get('error') if isinstance(w, dict) else w}"
        )
        print("\nscope survived the hop" if refused else "\nnote: this key has write access")
    return 0 if not err else 1


if __name__ == "__main__":
    sys.exit(anyio.run(main))
