"""Tiny read-only HTTP API over the query layer, for the console's live "Ask" feature.

    make api            (python -m reachable.api, http://127.0.0.1:8787)

Endpoints (GET, JSON):
  /health
  /ask/exposed?advisory=<id>[&service=<owner/repo>]      Q1 membership + proving paths
  /ask/pulls?package=<name>&service=<owner/repo>          what pulls a package into a service
  /ask/while-live?advisory=<id>                            Q3
  /ask/depends?package=<name>&version=<v>                  services resolving that exact version
  /ask/versions?advisory=<id>                              Q2
  /ask/maintainers?advisory=<id>                           Q4
  /ask/typosquats?package=<name>                           Q5
  /cypher?q=<statement>                                    read-only console: MATCH/CALL only

Stdlib only, single-threaded, loopback by default. Not a public surface: the deployed
console runs from committed JSON and shows live features as unavailable when this is
not reachable. Every response carries the executed statements and measured ms.
"""

import json
import os
import re
import sys
import time
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from reachable import queries
from reachable.db import session, timed
from reachable.ids import gid, safe_name

HOST = os.environ.get("REACHABLE_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("REACHABLE_API_PORT", "8787"))
_ADV = re.compile(
    r"^(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|MAL-\d{4}-\d+|CVE-\d{4}-\d+|MAL-TEST-\d+|GHSA-TEST-[A-Z]+)$"
)
_SLUG = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_READ_ONLY = re.compile(r"^\s*(MATCH|CALL|RETURN|WITH|UNWIND\s+\[)", re.IGNORECASE)
_WRITE = re.compile(r"\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP)\b", re.IGNORECASE)


class Bad(Exception):
    pass


def _adv(q) -> str:
    a = (q.get("advisory") or [""])[0].strip()
    if not _ADV.match(a):
        raise Bad("advisory must look like GHSA-xxxx-xxxx-xxxx, MAL-YYYY-N or CVE-YYYY-N")
    return a


def _svc(q, required=True) -> str | None:
    s = (q.get("service") or [""])[0].strip()
    if not s:
        if required:
            raise Bad("service must be owner/repo")
        return None
    if not _SLUG.match(s):
        raise Bad("service must be owner/repo")
    return f"svc:{s}"


def _pkg(q) -> str:
    try:
        return safe_name((q.get("package") or [""])[0].strip())
    except ValueError as e:
        raise Bad(str(e)) from e


def _res(r: queries.Result, **extra) -> dict:
    d = asdict(r)
    d.update(extra)
    return d


def ask_exposed(s, q):
    adv = _adv(q)
    svc = _svc(q, required=False)
    q2 = queries.q2_affected_versions(s, adv)
    bad = [r["version"] for r in q2.rows]
    if not bad:
        return {
            "rows": [],
            "ms": q2.ms,
            "cypher": q2.cypher,
            "limitations": ["advisory not in graph or affects no known version"],
            "meta": {},
        }
    r = queries.q1_exposed_services(s, bad)
    if svc:
        r.rows = [x for x in r.rows if x["service"] == svc]
        r.meta["services"] = [svc] if r.rows else []
    r.cypher = q2.cypher + r.cypher
    r.ms += q2.ms
    return _res(r, bad_versions=bad)


def ask_pulls(s, q):
    pkg, svc = _pkg(q), _svc(q)
    res = queries.Result([], 0.0)
    rows = queries._run(
        s,
        res,
        f"MATCH (sv:Service {{id: {gid(svc)}}})-[:HAS_LOCKFILE]->(l:Lockfile)-[r:RESOLVED]->(v:Version)"
        f"-[:VERSION_OF]->(p:Package {{id: {gid(f'pkg:npm/{pkg}')}}}) "
        "RETURN l.key AS lockfile, l.id AS lid, l.sha AS sha, l.committed_at AS committed_at, "
        "v.key AS version, v.id AS vid ORDER BY l.committed_at DESC",
    )
    sp = (
        "CALL algo.SPpaths({sourceNode: $src, targetNode: $dst, relTypes: ['DEPENDS_ON', 'RESOLVED'], "
        "relDirection: 'incoming', maxLen: 9, pathCount: 3}) YIELD path RETURN path"
    )
    for row in rows[:6]:
        row["paths"] = [
            {"chain": c, "hops": (len(c) - 1) // 2 - 1}
            for c in (
                queries._pathkeys(pr["path"])
                for pr in queries._run(s, res, sp, src=row["vid"], dst=row["lid"])
            )
        ]
    for row in rows:
        row.pop("lid", None)
        row.pop("vid", None)
    res.rows = rows
    res.limitations.append("Newest 6 lockfiles are explained with up to 3 shortest chains each.")
    return _res(res)


def ask_depends(s, q):
    pkg = _pkg(q)
    ver = (q.get("version") or [""])[0].strip()
    key = f"pkg:npm/{pkg}@{ver}"
    from reachable.ids import safe_purl

    try:
        safe_purl(pkg, ver)
    except ValueError as e:
        raise Bad(str(e)) from e
    r = queries.q1_exposed_services(s, [key], explain=False)
    return _res(r, version=key)


def ask_maintainers(s, q):
    q2 = queries.q2_affected_versions(s, _adv(q))
    if not q2.rows:
        return {
            "rows": [],
            "ms": q2.ms,
            "cypher": q2.cypher,
            "limitations": ["advisory affects no known version"],
            "meta": {},
        }
    r = queries.q4_maintainer_fanout(s, q2.rows[0]["version"])
    r.cypher = q2.cypher + r.cypher
    r.ms += q2.ms
    return _res(r)


def ask_cypher(s, q):
    stmt = (q.get("q") or [""])[0].strip()
    if not stmt or len(stmt) > 4000:
        raise Bad("q required (≤ 4000 chars)")
    if not _READ_ONLY.match(stmt) or _WRITE.search(stmt):
        raise Bad(
            "read-only console: statements must start with MATCH/CALL and contain no CREATE/MERGE/SET/DELETE/REMOVE"
        )
    if "LIMIT" not in stmt.upper() and "algo." not in stmt:
        stmt = stmt + " LIMIT 200"
    rows, ms = timed(s, stmt)
    return {
        "rows": rows[:200],
        "ms": ms,
        "cypher": [stmt],
        "limitations": ["Capped at 200 rows; 30 s engine timeout applies."],
        "meta": {},
    }


ROUTES = {
    "/ask/exposed": ask_exposed,
    "/ask/pulls": ask_pulls,
    "/ask/depends": ask_depends,
    "/ask/while-live": lambda s, q: _res(queries.q3_resolved_while_live(s, _adv(q))),
    "/ask/versions": lambda s, q: _res(queries.q2_affected_versions(s, _adv(q))),
    "/ask/maintainers": lambda s, q: ask_maintainers(s, q),
    "/ask/typosquats": lambda s, q: _res(queries.q5_typosquats(s, f"pkg:npm/{_pkg(q)}")),
    "/cypher": ask_cypher,
}


class Handler(BaseHTTPRequestHandler):
    server_version = "reachable-api/0.1"

    def log_message(self, fmt, *args):  # quieter than the default
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")

    def _json(self, code: int, body: dict) -> None:
        data = json.dumps(body, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/health":
            with session() as s:
                n, ms = timed(s, "MATCH (sv:Service) RETURN count(*) AS c")
            return self._json(200, {"ok": True, "services": n[0]["c"], "ms": ms})
        fn = ROUTES.get(u.path)
        if fn is None:
            return self._json(404, {"error": "unknown route", "routes": sorted(ROUTES)})
        t0 = time.perf_counter()
        try:
            with session() as s:
                body = fn(s, q)
        except Bad as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — surface engine refusals verbatim to the console
            msg = str(e).split("{message: ")[-1].split("} {gql")[0]
            return self._json(502, {"error": msg[:400]})
        body["total_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        return self._json(200, body)


def main() -> None:
    srv = HTTPServer((HOST, PORT), Handler)
    print(
        f"reachable api on http://{HOST}:{PORT}  (read-only; loopback)", file=sys.stderr, flush=True
    )
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
