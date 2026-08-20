"""Tiny HTTP API over the query layer and the job runner, for the console.

    make api            (python -m reachable.api, http://127.0.0.1:8787)

Endpoints (JSON):
  GET  /health
  GET  /services                       Service nodes + lockfile count (anchored per service)
  POST /services/add  {"repo": ...}    -> 202 {job_id}; 400 bad slug; 409 already queued/running
  GET  /jobs · /jobs/<id>              ingest job records (jobs.py; status incl. `interrupted`)
  POST /jobs/<id>/retry                re-submit that job's repo -> 202 {job_id}; 404; 409
  POST /keys  {"name": ...}            mint a read-only key (open; rate-limited) -> 201; 429
  GET  /keys                           key-store stats
  DELETE /keys                         revoke the bearer token presented -> 200 {"revoked": bool}
  GET  /graph/stats                    node counts per label (null when admission control refuses)
                                       + edge counts summed from job records (never scanned)
  /ask/exposed?advisory=<id>[&service=<owner/repo>]      Q1 membership + proving paths
  /ask/pulls?package=<name>&service=<owner/repo>          what pulls a package into a service
  /ask/while-live?advisory=<id>                            Q3
  /ask/depends?package=<name>&version=<v>                  services resolving that exact version
  /ask/versions?advisory=<id>                              Q2
  /ask/maintainers?advisory=<id>                           Q4
  /ask/typosquats?package=<name>                           Q5
  /cypher?q=<statement>                                    read-only console: MATCH/CALL only

Stdlib only, loopback by default. Requests are served on threads so a running job never
blocks /health; graph writes happen only on the single job worker thread. Not a public
surface: the deployed console runs from committed JSON and shows live features as
unavailable when this is not reachable. Every ask response carries the executed
statements and measured ms.
"""

import hmac
import json
import os
import re
import sys
import time
from dataclasses import asdict
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

from reachable import jobs, keys, queries
from reachable.db import run, session, timed
from reachable.http import get_json
from reachable.ids import gid, safe_name
from reachable.sources.github import API as API_GH

HOST = os.environ.get("REACHABLE_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("REACHABLE_API_PORT", "8787"))
# When set, every route except /health requires `Authorization: Bearer <key>` — the console's
# server-side proxy and the MCP server send it. Unset = loopback-only development.
API_KEY = os.environ.get("REACHABLE_API_KEY", "").strip()
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


def _repo_slug(raw: str) -> str:
    """'owner/repo' or a github URL -> 'owner/repo'; raises Bad on anything else."""
    s = raw.strip()
    for prefix in ("https://github.com/", "http://github.com/", "github.com/"):
        if s.lower().startswith(prefix):
            s = s[len(prefix) :]
    s = s.strip("/").removesuffix(".git")
    if not _SLUG.match(s) or s.count("/") != 1:
        raise Bad("repo must be owner/repo or https://github.com/owner/repo")
    return s


def list_services(s) -> list[dict]:
    rows = run(
        s,
        "MATCH (sv:Service) RETURN sv.id AS id, sv.key AS key, sv.name AS name, "
        "sv.repo_url AS repo_url, sv.criticality AS criticality, sv.added_at AS added_at",
    )
    out = []
    for r in rows:
        lfs = run(
            s,
            f"MATCH (sv:Service {{id: {r['id']}}})-[:HAS_LOCKFILE]->(l:Lockfile) "
            "RETURN l.sha AS sha, l.committed_at AS at",
        )
        latest = max(lfs, key=lambda x: x["at"], default=None)
        out.append(
            {
                "key": r["key"],
                "name": r["name"],
                "repo_url": r["repo_url"],
                "criticality": r["criticality"],
                "lockfiles": len(lfs),
                "latest_commit": (
                    {
                        "sha": latest["sha"],
                        "committed_at": latest["at"],
                        "committed_at_iso": datetime.fromtimestamp(latest["at"], UTC).isoformat(),
                    }
                    if latest
                    else None
                ),
                "added_at": r.get("added_at"),
            }
        )
    return sorted(out, key=lambda x: x["key"])


def find_victims(s, q) -> dict:
    """Public GitHub repos whose package-lock.json pins an affected version of this advisory.

    GitHub code search on the exact tarball name (`debug-4.4.2.tgz`) is the cheapest honest signal
    that a repo resolved the version — it is what the lockfile literally contains. Nothing is
    computed about them; the list is candidates to *watch*, and watching runs the real ingest.
    Cache key includes the day so results refresh daily; needs GITHUB_TOKEN (code search is
    authenticated-only, 10 requests/min)."""
    from reachable.sources.github import _H

    adv = _adv(q)
    a = queries.q2_affected_versions(s, adv)
    if not a.rows:
        raise Bad(f"{adv} has no affected versions in the graph")
    if not _H:
        raise Bad("GITHUB_TOKEN is not set — code search is authenticated-only")
    # removed (taken-down) versions first: those are the malicious ones; at most 3 searches.
    ranked = sorted(a.rows, key=lambda r: (not r.get("removed"), r.get("published_at") or 0))
    watched = {x["key"] for x in list_services(s)}
    day = datetime.now(UTC).date().isoformat()
    victims: dict[str, dict] = {}
    searched, errors = [], []
    for r in ranked[:3]:
        name, _, ver = str(r["version"]).removeprefix("pkg:npm/").rpartition("@")
        tarball = f"{name.rpartition('/')[2]}-{ver}.tgz"
        # unquoted on purpose: the quoted form times out (408) on GitHub's side, unquoted answers in ~10 s
        query = f"{tarball} filename:package-lock.json"
        searched.append(query)
        try:
            res = get_json(
                f"{API_GH}/search/code?q={quote(query)}&per_page=30&_d={day}",
                headers={**_H, "Accept": "application/vnd.github+json"},
            )
        except Exception as e:  # noqa: BLE001 — a 403 rate-limit is a fact for the UI, not a crash
            errors.append(str(e)[:200])
            continue
        for it in res.get("items", []):
            slug = it["repository"]["full_name"]
            v = victims.setdefault(
                slug,
                {
                    "repo": slug,
                    "url": it["repository"]["html_url"],
                    "path": it["path"],
                    "versions": [],
                    "watched": f"svc:{slug}" in watched,
                },
            )
            if r["version"] not in v["versions"]:
                v["versions"].append(r["version"])
    return {
        "advisory": adv,
        "searched": searched,
        "rows": sorted(victims.values(), key=lambda v: (v["watched"], v["repo"])),
        "errors": errors,
        # The rows come from GitHub, but the versions searched for came from the graph — carry the
        # statement that chose them so the answer is auditable like every other one.
        "cypher": a.cypher,
        "limitations": [
            (
                "GitHub code search indexes default branches only and skips forks and files "
                ">384 KB; a hit means the lockfile pins the version today, not when it was live "
                "— watch the repo to get the timeline from HydraDB."
            )
        ],
    }


def graph_stats(s) -> dict:
    nodes = {}
    for label in ("Service", "Lockfile", "Package", "Version", "Advisory", "Maintainer", "File"):
        try:
            nodes[label] = run(s, f"MATCH (n:{label}) RETURN count(*) AS c")[0]["c"]
        except Exception:  # noqa: BLE001 — admission control refuses whole-label counts past 250k
            nodes[label] = None
    edges, last = jobs.edges_written()
    return {"nodes": nodes, "edges_written": edges, "last_ingest": last}


def graph_sample(s, q) -> dict:
    """A bounded, anchored neighbourhood for the console's graph view. Never a scan.

    ?service=owner/repo  → the service, its lockfiles (≤10), the advisory-affected versions
                           they resolve (≤40), those versions' packages, the advisories, and
                           the packages' maintainers (≤20)
    ?advisory=<id>       → the advisory, affected versions that some lockfile resolved (≤40),
                           their packages, the lockfiles (≤30) and services
    Every hop is anchored on an id; caps keep the picture readable and the query bounded.
    """
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    ex: list[str] = []
    res = queries.Result([], 0.0)

    def add(key: str, label: str, **props):
        nodes.setdefault(key, {"id": key, "label": label, **props})

    def link(a: str, t: str, b: str):
        edges.append({"s": a, "t": b, "type": t})

    svc = _svc(q, required=False)
    adv = (q.get("advisory") or [""])[0].strip()
    if svc:
        add(svc, "Service", name=svc[4:])
        lfs = queries._run(
            s,
            res,
            f"MATCH (sv:Service {{id: {gid(svc)}}})-[:HAS_LOCKFILE]->(l:Lockfile) "
            "RETURN l.key AS k, l.id AS id, l.sha AS sha, l.committed_at AS at ORDER BY l.committed_at DESC",
        )[:10]
        for lf in lfs:
            add(lf["k"], "Lockfile", sha=lf["sha"][:12], at=lf["at"])
            link(svc, "HAS_LOCKFILE", lf["k"])
        seen_v = 0
        for lf in lfs:
            for r in queries._run(
                s,
                res,
                f"MATCH (l:Lockfile {{id: {lf['id']}}})-[:RESOLVED]->(v:Version)<-[af:AFFECTS]-(a:Advisory) "
                "MATCH (v)-[:VERSION_OF]->(p:Package) "
                "RETURN v.key AS v, v.id AS vid, p.key AS p, p.id AS pid, a.key AS a, a.kind AS kind, a.severity AS sev",
            ):
                if r["v"] not in nodes:
                    if seen_v >= 40:
                        continue
                    seen_v += 1
                add(r["v"], "Version", removed=False)
                add(r["p"], "Package")
                add(r["a"], "Advisory", kind=r["kind"], severity=r["sev"])
                link(lf["k"], "RESOLVED", r["v"])
                link(r["v"], "VERSION_OF", r["p"])
                link(r["a"], "AFFECTS", r["v"])
        if seen_v == 0 and lfs:
            # nothing advisory-affected (yet): show the newest lockfile's first resolved packages
            # so the neighbourhood is never an empty picture
            for r in queries._run(
                s,
                res,
                f"MATCH (l:Lockfile {{id: {lfs[0]['id']}}})-[:RESOLVED]->(v:Version)-[:VERSION_OF]->(p:Package) "
                "RETURN v.key AS v, p.key AS p ORDER BY p.key ASC LIMIT 24",
            ):
                add(r["v"], "Version")
                add(r["p"], "Package")
                link(lfs[0]["k"], "RESOLVED", r["v"])
                link(r["v"], "VERSION_OF", r["p"])
        pk = [n for n in nodes.values() if n["label"] == "Package"][:15]
        mcount = 0
        for pnode in pk:
            for r in queries._run(
                s,
                res,
                f"MATCH (p:Package {{id: {gid(pnode['id'])}}})<-[:MAINTAINS]-(m:Maintainer) RETURN m.key AS m",
            ):
                if mcount >= 20 and r["m"] not in nodes:
                    continue
                if r["m"] not in nodes:
                    mcount += 1
                add(r["m"], "Maintainer")
                link(r["m"], "MAINTAINS", pnode["id"])
    elif adv:
        if not _ADV.match(adv):
            raise Bad("advisory must look like GHSA-…/MAL-…/CVE-…")
        a = queries._run(
            s,
            res,
            f"MATCH (a:Advisory {{id: {gid(adv)}}}) RETURN a.key AS k, a.kind AS kind, a.severity AS sev",
        )
        if not a:
            raise Bad("advisory not in graph")
        add(adv, "Advisory", kind=a[0]["kind"], severity=a[0]["sev"])
        rows = queries._run(
            s,
            res,
            f"MATCH (a:Advisory {{id: {gid(adv)}}})-[:AFFECTS]->(v:Version)<-[r:RESOLVED]-(l:Lockfile)<-[:HAS_LOCKFILE]-(sv:Service) "
            "MATCH (v)-[:VERSION_OF]->(p:Package) "
            "RETURN v.key AS v, p.key AS p, l.key AS l, l.sha AS sha, l.committed_at AS at, sv.key AS sv",
        )
        vs, ls = set(), set()
        for r in rows:
            if r["v"] not in vs and len(vs) >= 40:
                continue
            if r["l"] not in ls and len(ls) >= 30:
                continue
            vs.add(r["v"])
            ls.add(r["l"])
            add(r["v"], "Version")
            add(r["p"], "Package")
            add(r["l"], "Lockfile", sha=r["sha"][:12], at=r["at"])
            add(r["sv"], "Service", name=r["sv"][4:])
            link(adv, "AFFECTS", r["v"])
            link(r["v"], "VERSION_OF", r["p"])
            link(r["l"], "RESOLVED", r["v"])
            link(r["sv"], "HAS_LOCKFILE", r["l"])
        if not rows:
            # still show the affected versions/packages even if no watched service resolves them
            for r in queries._run(
                s,
                res,
                f"MATCH (a:Advisory {{id: {gid(adv)}}})-[:AFFECTS]->(v:Version)-[:VERSION_OF]->(p:Package) RETURN v.key AS v, p.key AS p",
            )[:40]:
                add(r["v"], "Version")
                add(r["p"], "Package")
                link(adv, "AFFECTS", r["v"])
                link(r["v"], "VERSION_OF", r["p"])
    else:
        raise Bad("pass ?service=owner/repo or ?advisory=<id>")
    # dedupe edges
    uniq = {(e["s"], e["t"], e["type"]): e for e in edges}
    return {
        "nodes": list(nodes.values()),
        "edges": list(uniq.values()),
        "cypher": res.cypher,
        "ms": round(res.ms, 2),
        "limitations": ex
        + ["Bounded neighbourhood: ≤10 lockfiles, ≤40 versions, ≤20 maintainers."],
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
    "/victims": find_victims,
    "/graph/sample": graph_sample,
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

    def _bearer(self) -> str:
        h = self.headers.get("Authorization", "")
        return h[7:] if h.startswith("Bearer ") else ""

    def _scope(self) -> str | None:
        """ "admin" (operator key, or no key configured), "read" (minted key), or None."""
        if not API_KEY:
            return "admin"
        tok = self._bearer()
        if tok and hmac.compare_digest(tok, API_KEY):
            return "admin"
        if tok and keys.check(tok):
            keys.touch(tok)
            return "read"
        return None

    def _client(self) -> str:
        """Caddy sets X-Forwarded-For; fall back to the socket for a direct call."""
        fwd = self.headers.get("X-Forwarded-For", "")
        return (fwd.split(",")[0].strip() if fwd else self.client_address[0]) or "unknown"

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/keys":
            # Deliberately open: a minted key is read-only, expiring and rate-limited, so it grants
            # no more than reading a graph of public repositories and public advisories.
            try:
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n) or b"{}")
                rec = keys.mint(str(body.get("name", "")), self._client())
            except (ValueError, AttributeError) as e:
                return self._json(400, {"error": f"bad JSON body: {e}"})
            except keys.Refused as e:
                return self._json(429, {"error": str(e)})
            return self._json(201, rec)
        if self._scope() != "admin":
            return self._json(401, {"error": "missing or invalid API key"})
        if u.path.startswith("/jobs/") and u.path.endswith("/retry"):
            try:
                job = jobs.retry(u.path[len("/jobs/") : -len("/retry")])
            except KeyError:
                return self._json(404, {"error": "no such job"})
            except jobs.Conflict as e:
                return self._json(
                    409, {"error": "a job for this repo is queued or running", "job_id": str(e)}
                )
            return self._json(202, {"job_id": job.job_id, "repo": job.repo})
        if u.path != "/services/add":
            return self._json(404, {"error": "unknown route"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            repo = _repo_slug(str(body.get("repo", "")))
            crit = int(body.get("criticality", 1))
            if crit not in (1, 2, 3):
                raise Bad("criticality must be 1, 2 or 3")
        except (ValueError, AttributeError) as e:
            return self._json(400, {"error": f"bad JSON body: {e}"})
        except Bad as e:
            return self._json(400, {"error": str(e)})
        try:
            job = jobs.submit(repo, crit)
        except jobs.Conflict as e:
            return self._json(
                409, {"error": "a job for this repo is queued or running", "job_id": str(e)}
            )
        return self._json(202, {"job_id": job.job_id, "repo": repo})

    def do_DELETE(self):
        u = urlparse(self.path)
        if u.path == "/keys":
            # A key revokes itself. Holding the token is the proof of ownership, so this needs no
            # scope of its own — and it is the one write a read-only key is allowed to make.
            tok = self._bearer()
            if not tok:
                return self._json(401, {"error": "send the key to revoke as a bearer token"})
            # Same 200 either way: a caller who already holds the token learns nothing from the
            # boolean, and an invalid one gets no oracle telling it what exists.
            return self._json(200, {"revoked": keys.revoke(tok)})
        return self._json(404, {"error": "not found"})

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path != "/health" and self._scope() is None:
            return self._json(401, {"error": "missing or invalid API key"})
        if u.path == "/keys":
            return self._json(200, keys.stats())
        if u.path == "/health":
            with session() as s:
                n, ms = timed(s, "MATCH (sv:Service) RETURN count(*) AS c")
            return self._json(200, {"ok": True, "services": n[0]["c"], "ms": ms})
        if u.path == "/jobs":
            return self._json(200, [j.public() for j in jobs.all_jobs()])
        if u.path.startswith("/jobs/"):
            j = jobs.get(u.path[len("/jobs/") :])
            return (
                self._json(200, j.public(with_log=True))
                if j
                else self._json(404, {"error": "no such job"})
            )
        if u.path in ("/services", "/graph/stats"):
            try:
                with session() as s:
                    body = list_services(s) if u.path == "/services" else graph_stats(s)
            except Exception as e:  # noqa: BLE001
                return self._json(502, {"error": str(e)[:400]})
            return self._json(200, body)
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
    jobs.start()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    print(f"reachable api on http://{HOST}:{PORT}  (loopback)", file=sys.stderr, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
