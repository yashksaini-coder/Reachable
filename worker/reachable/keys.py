"""Minted API keys for MCP clients.

The operator key (REACHABLE_API_KEY) is full access and never leaves the VM. Keys minted here are
deliberately weaker so that minting can be self-serve without handing out the console's own
authority:

  read-only  GET routes only, so a minted key cannot queue an ingest or spend the GitHub budget
  expiring   TTL_DAYS, so an abandoned key stops working on its own
  rate-limited  per client and in total, so minting cannot itself become the abuse
  hashed at rest  the file holds sha256(token), so a leaked keys.json yields no usable key

Nothing here grants more than reading a graph built from public repositories and public advisories.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from pathlib import Path

STORE = Path(os.environ.get("REACHABLE_CACHE", ".cache")) / "keys.json"
TTL_DAYS = 7
MAX_ACTIVE = 200  # total live keys; refuse rather than grow without bound
PER_CLIENT_HOUR = 5  # mints per client per hour
_LOCK = threading.Lock()


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _load() -> dict:
    try:
        return json.loads(STORE.read_text())
    except (OSError, ValueError):
        return {"keys": {}, "mints": []}


def _save(d: dict) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STORE.with_suffix(".tmp")
    tmp.write_text(json.dumps(d))
    tmp.replace(STORE)
    os.chmod(STORE, 0o600)


def _live(rec: dict, now: float) -> bool:
    return rec.get("expires_at", 0) > now


class Refused(Exception):
    """Minting refused — the message is safe to show the caller."""


def mint(name: str, client: str) -> dict:
    """Issue a read-only token. Returns the record plus `token`, which is shown exactly once."""
    name = (name or "").strip()[:60] or "unnamed"
    now = time.time()
    with _LOCK:
        d = _load()
        d["keys"] = {k: v for k, v in d["keys"].items() if _live(v, now)}
        recent = [t for t in d.get("mints", []) if t[0] > now - 3600]
        if sum(1 for t in recent if t[1] == client) >= PER_CLIENT_HOUR:
            raise Refused(f"{PER_CLIENT_HOUR} keys an hour per client — try again later")
        if len(d["keys"]) >= MAX_ACTIVE:
            raise Refused("too many active keys on this worker")
        token = "rk_" + secrets.token_urlsafe(32)
        rec = {
            "name": name,
            "scope": "read",
            "created_at": now,
            "expires_at": now + TTL_DAYS * 86400,
            "last_used": None,
        }
        d["keys"][_hash(token)] = rec
        recent.append([now, client])
        d["mints"] = recent
        _save(d)
    return {**rec, "token": token, "ttl_days": TTL_DAYS}


def check(token: str) -> dict | None:
    """The record for a live minted token, or None. Constant-time against the stored hashes."""
    if not token:
        return None
    h = _hash(token)
    now = time.time()
    d = _load()
    for stored, rec in d["keys"].items():
        if hmac.compare_digest(stored, h) and _live(rec, now):
            return rec
    return None


def touch(token: str) -> None:
    """Record last use. Best-effort: never let bookkeeping fail a request."""
    h = _hash(token)
    try:
        with _LOCK:
            d = _load()
            if h in d["keys"]:
                d["keys"][h]["last_used"] = time.time()
                _save(d)
    except OSError:
        pass


def stats() -> dict:
    now = time.time()
    d = _load()
    live = [v for v in d["keys"].values() if _live(v, now)]
    return {"active": len(live), "ttl_days": TTL_DAYS, "scope": "read", "max_active": MAX_ACTIVE}
