"""Connection to the HydraDB graph-node. The only place HYDRA_TOKEN is read.

Auth is basic-auth with the graph auth token as the password — that is what
HydraDB's own scripts/runtime_smoke.sh does, not a bearer scheme.
"""

import os
import time
from contextlib import contextmanager

from neo4j import GraphDatabase

URI = os.environ.get("HYDRA_URI", "bolt://127.0.0.1:7687")
HTTP_URL = os.environ.get("HYDRA_HTTP_URL", "http://127.0.0.1:8443")
DATABASE = os.environ.get("HYDRA_DATABASE", "default")
_DEV_TOKEN = "local-development-token-32-bytes"


def token() -> str:
    t = os.environ.get("HYDRA_TOKEN")
    if t:
        return t
    if "127.0.0.1" in URI or "localhost" in URI:
        return _DEV_TOKEN
    raise RuntimeError("HYDRA_TOKEN is unset and HYDRA_URI is not loopback")


TOKEN = token()


def driver():
    return GraphDatabase.driver(URI, auth=("neo4j", TOKEN))


@contextmanager
def session():
    with driver() as d, d.session(database=DATABASE) as s:
        yield s


def run(s, query: str, **params) -> list[dict]:
    """Auto-commit run, rows as dicts. HydraDB refuses explicit transactions."""
    return [r.data() for r in s.run(query, **params)]


def timed(s, query: str, **params) -> tuple[list[dict], float]:
    """Same as run(), plus wall-clock milliseconds. Every quoted latency comes from here."""
    t0 = time.perf_counter()
    rows = run(s, query, **params)
    return rows, (time.perf_counter() - t0) * 1000
