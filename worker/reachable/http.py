"""Disk-cached HTTP GET/POST. The pipeline runs fifty times; registries are the slow part.

Cache key = sha256(method + url + body). Responses are cached forever — a re-run
never re-fetches. Delete .cache/ to refresh. Non-2xx responses are cached too
(as 404s etc.) so a missing package is not re-asked on every run — except 401/403/408/429/5xx,
which are transient and never cached.
"""

import hashlib
import json
import os
import time
from pathlib import Path

import httpx

CACHE = Path(os.environ.get("REACHABLE_CACHE", ".cache"))
_client = httpx.Client(timeout=60, follow_redirects=True, headers={"User-Agent": "reachable/0.1"})


class HttpError(Exception):
    def __init__(self, status: int, url: str, body: str):
        super().__init__(f"{status} {url}: {body[:200]}")
        self.status = status


def _path(method: str, url: str, body: bytes | None) -> Path:
    h = hashlib.sha256(method.encode() + url.encode() + (body or b"")).hexdigest()
    return CACHE / h[:2] / f"{h}.json"


def request(method: str, url: str, *, json_body=None, headers=None, retries: int = 6) -> dict:
    """Return {"status": int, "body": str}. Cached on disk by (method, url, body)."""
    body = json.dumps(json_body, sort_keys=True).encode() if json_body is not None else None
    p = _path(method, url, body)
    if p.exists():
        return json.loads(p.read_text())
    for attempt in range(retries):
        try:
            r = _client.request(
                method,
                url,
                content=body,
                headers={
                    **({"Content-Type": "application/json"} if body else {}),
                    **(headers or {}),
                },
            )
        except httpx.HTTPError:
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)
            continue
        if r.status_code in (408, 429, 500, 502, 503, 504) and attempt < retries - 1:
            # Cloudflare 429s rarely carry retry-after; back off hard rather than burn retries.
            time.sleep(float(r.headers.get("retry-after", 0)) or 5 * (attempt + 1))
            continue
        out = {"status": r.status_code, "body": r.text}
        # never cache transient failures — nor auth/rate-limit answers, which flip once a
        # token is set or the limit resets
        if r.status_code < 500 and r.status_code not in (401, 403, 408, 429):
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(out))
        return out
    raise AssertionError("unreachable")


def get_json(url: str, *, headers=None, ok404: bool = False):
    r = request("GET", url, headers=headers)
    if r["status"] == 404 and ok404:
        return None
    if r["status"] >= 400:
        raise HttpError(r["status"], url, r["body"])
    return json.loads(r["body"])


def post_json(url: str, body, *, headers=None):
    r = request("POST", url, json_body=body, headers=headers)
    if r["status"] >= 400:
        raise HttpError(r["status"], url, r["body"])
    return json.loads(r["body"])
