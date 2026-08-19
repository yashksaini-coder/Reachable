"""MCP over streamable HTTP, so a client needs a URL and a key — no clone, no venv, no Python.

The stdio server is for people running their own worker. This is for everyone else: point a client
at https://<host>/mcp with a bearer token and the same twelve tools answer.

Each request relays to the worker with the *caller's* key, not the operator's. That matters: the
MCP process holds no authority of its own, so a read-only key stays read-only through MCP and
watch_repository still comes back 401 — the same guard that protects the API directly.
"""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from reachable import keys
from reachable.dotenv import load_dotenv
from reachable.mcp_server import CALLER_KEY, mcp

load_dotenv()
OPERATOR = os.environ.get("REACHABLE_API_KEY", "").strip()
HOST = os.environ.get("REACHABLE_MCP_HOST", "127.0.0.1")
PORT = int(os.environ.get("REACHABLE_MCP_PORT", "8788"))


def _bearer(request) -> str:
    h = request.headers.get("authorization", "")
    return h[7:].strip() if h.lower().startswith("bearer ") else ""


class Auth(BaseHTTPMiddleware):
    """Same keys as the API: the operator key, or a minted read-only one."""

    async def dispatch(self, request, call_next):
        if request.url.path.rstrip("/").endswith("/health"):
            return JSONResponse({"ok": True, "transport": "streamable-http"})
        token = _bearer(request)
        if not OPERATOR:
            pass  # unset means loopback development, same as the API
        elif not (token and (token == OPERATOR or keys.check(token))):
            return JSONResponse({"error": "missing or invalid API key"}, status_code=401)
        reset = CALLER_KEY.set(token)
        try:
            return await call_next(request)
        finally:
            CALLER_KEY.reset(reset)


app = mcp.streamable_http_app()
app.add_middleware(Auth)


def main() -> None:
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")  # access logs: the operator needs them


if __name__ == "__main__":
    main()
