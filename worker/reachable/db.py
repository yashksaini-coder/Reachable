"""Connection to the HydraDB graph-node. The only place HYDRA_TOKEN is read.

Auth is basic-auth with the graph auth token as the password — that is what
HydraDB's own scripts/runtime_smoke.sh does, not a bearer scheme.
"""

import contextlib
import os
import time
from contextlib import contextmanager

from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable, SessionExpired

from reachable.dotenv import load_dotenv as _load_dotenv

_load_dotenv()

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


class Session:
    """A Bolt session that survives the server closing an idle connection.

    Ingest stages spend minutes on HTTP between writes; the node drops idle Bolt sockets and
    the next statement fails with ServiceUnavailable ("defunct connection"). Reopen once and
    retry — every statement is an idempotent MERGE or a read, so a retry is always safe."""

    def __init__(self, drv):
        self._drv = drv
        self._s = drv.session(database=DATABASE)

    def _reopen(self) -> None:
        with contextlib.suppress(Exception):  # the socket is already gone
            self._s.close()
        self._s = self._drv.session(database=DATABASE)

    def run(self, query: str, **params):
        try:
            return self._s.run(query, **params)
        except (ServiceUnavailable, SessionExpired):
            self._reopen()
            return self._s.run(query, **params)

    def close(self) -> None:
        self._s.close()


@contextmanager
def session():
    with driver() as d:
        s = Session(d)
        try:
            yield s
        finally:
            s.close()


def run(s, query: str, **params) -> list[dict]:
    """Auto-commit run, rows as dicts. HydraDB refuses explicit transactions."""
    try:
        return [r.data() for r in s.run(query, **params)]
    except (ServiceUnavailable, SessionExpired):
        # the connection can also die mid-stream on the first fetch; reopen and retry once
        if isinstance(s, Session):
            s._reopen()
            return [r.data() for r in s.run(query, **params)]
        raise


def timed(s, query: str, **params) -> tuple[list[dict], float]:
    """Same as run(), plus wall-clock milliseconds. Every quoted latency comes from here."""
    t0 = time.perf_counter()
    rows = run(s, query, **params)
    return rows, (time.perf_counter() - t0) * 1000
