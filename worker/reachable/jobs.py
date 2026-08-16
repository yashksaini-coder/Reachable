"""Per-repo ingest jobs: one worker thread, one queue, one job at a time (single-threaded
engine access). Steps, in order: lockfiles · packages · advisories · reach · done.

    jobs.start()                 # spawn the worker thread (api.py does this)
    jobs.submit("owner/repo")    # -> Job (raises Conflict if that repo is queued/running)
    jobs.run_repo("owner/repo")  # synchronous, same steps (pipeline.py --repo)

Finished jobs are appended to .cache/jobs.jsonl and reloaded at startup so a restart
still shows history. Every job records the edge counts it wrote — that is the only
source for /graph/stats edge numbers (whole-type edge scans time out, AGENTS.md §8).
"""

import json
import queue
import threading
import time
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path

from reachable import pipeline
from reachable.db import run, session
from reachable.ids import gid
from reachable.load import log, upsert_edges, upsert_nodes
from reachable.sources import github, reach

HISTORY = Path(".cache") / "jobs.jsonl"
STEPS = ["lockfiles", "packages", "advisories", "reach"]


class Conflict(Exception):
    pass


@dataclass
class Job:
    job_id: str
    repo: str
    criticality: int = 1
    status: str = "queued"  # queued | running | done | failed
    started_at: int | None = None
    ended_at: int | None = None
    step: str | None = None
    steps: list[dict] = field(default_factory=list)
    log: list[str] = field(default_factory=list)
    edges: dict[str, int] = field(default_factory=dict)

    def say(self, msg: str) -> None:
        self.log.append(f"{time.strftime('%H:%M:%S')} {msg}")
        log(f"job {self.job_id[:8]} {self.repo}: {msg}")

    def public(self, with_log: bool = False) -> dict:
        d = asdict(self)
        if with_log:
            d["log"] = d["log"][-200:]
        else:
            d.pop("log")
        return d


_jobs: dict[str, Job] = {}
_lock = threading.Lock()
_q: queue.Queue[Job] = queue.Queue()
_thread: threading.Thread | None = None


def _load_history() -> None:
    if not HISTORY.exists():
        return
    for line in HISTORY.read_text().splitlines():
        if line.strip():
            d = json.loads(line)
            _jobs[d["job_id"]] = Job(**d)


def _persist(job: Job) -> None:
    HISTORY.parent.mkdir(exist_ok=True)
    with HISTORY.open("a") as f:
        f.write(json.dumps(asdict(job)) + "\n")


def start() -> None:
    global _thread
    with _lock:
        if _thread is not None:
            return
        _load_history()
        _thread = threading.Thread(target=_worker, name="jobs", daemon=True)
        _thread.start()


def _worker() -> None:
    while True:
        job = _q.get()
        try:
            _run(job)
        finally:
            _q.task_done()


def submit(repo: str, criticality: int = 1) -> Job:
    with _lock:
        for j in _jobs.values():
            if j.repo == repo and j.status in ("queued", "running"):
                raise Conflict(j.job_id)
        job = Job(job_id=uuid.uuid4().hex, repo=repo, criticality=criticality)
        _jobs[job.job_id] = job
    _q.put(job)
    return job


def all_jobs() -> list[Job]:
    with _lock:
        return sorted(_jobs.values(), key=lambda j: j.started_at or 2**62, reverse=True)


def get(job_id: str) -> Job | None:
    with _lock:
        return _jobs.get(job_id)


def run_repo(repo: str, criticality: int = 1) -> Job:
    """Synchronous per-repo pipeline (CLI path). Not registered in the queue."""
    job = Job(job_id=uuid.uuid4().hex, repo=repo, criticality=criticality)
    _run(job)
    return job


# ---------------------------------------------------------------- the pipeline


def _run(job: Job) -> None:
    job.status, job.started_at = "running", int(time.time())
    try:
        with session() as s:
            ctx: dict = {}
            for name in STEPS:
                job.step = name
                st = {"name": name, "status": "running", "ms": 0.0, "detail": ""}
                job.steps.append(st)
                t0 = time.perf_counter()
                st["detail"] = globals()[f"step_{name}"](s, job, ctx) or ""
                st["ms"] = round((time.perf_counter() - t0) * 1000, 1)
                st["status"] = "done"
                job.say(f"{name}: {st['detail']} ({st['ms']:.0f} ms)")
        job.status, job.step = "done", "done"
    except Exception as e:  # noqa: BLE001 — a failed job is a record, not a crash
        if job.steps and job.steps[-1]["status"] == "running":
            job.steps[-1].update(status="failed", detail=str(e)[:400])
        job.status = "failed"
        job.say(f"failed: {e!s:.400}")
    job.ended_at = int(time.time())
    _persist(job)


def step_lockfiles(s, job: Job, ctx: dict) -> str:
    # yearly cutoffs + the 24 most recent lockfile commits: dense recent history so a narrow
    # incident window (95 min for chalk@5.6.1) has a chance of a snapshot inside it.
    r = github.ingest_service(job.repo, job.criticality, pipeline.yearly_cutoffs(), [], recent=24)
    if not r["lockfiles"]:
        raise RuntimeError(
            f"no package-lock.json v3 snapshot found ({len(r['skipped_snapshots'])} skipped)"
        )
    r["service"]["added_at"] = int(time.time())
    for k, n in pipeline.write_service(s, r).items():
        job.edges[k] = job.edges.get(k, 0) + n
    ctx["touched"] = pipeline.versions_of(r)
    latest = max(r["lockfiles"], key=lambda lf: lf["committed_at"])
    ctx["sha"] = latest["sha"]
    return (
        f"{len(r['lockfiles'])} lockfiles, {len(r['versions'])} versions, "
        f"{len(r['resolved'])} RESOLVED, {len(r['depends_on'])} DEPENDS_ON, "
        f"{len(r['skipped_snapshots'])} snapshots skipped"
    )


def step_packages(s, job: Job, ctx: dict) -> str:
    touched = ctx["touched"]
    ctx["known"] = pipeline.stage_packages(s, sorted(touched), keep=touched)
    return f"{len(ctx['known'])} packuments, {sum(len(v) for v in touched.values())} versions kept"


def step_advisories(s, job: Job, ctx: dict) -> str:
    pairs = sorted((n, v) for n, vs in ctx["touched"].items() for v in vs)
    c = pipeline.ingest_advisories(s, pairs, ctx["known"])
    job.edges["AFFECTS"] = job.edges.get("AFFECTS", 0) + c["AFFECTS"]
    return f"{c['advisories']} advisories, {c['AFFECTS']} AFFECTS, {c['malicious']} malicious"


def step_reach(s, job: Job, ctx: dict) -> str:
    """Import scan at the latest lockfile commit for the advisory-affected packages it
    resolves. Anchored on that one lockfile — never a scan over AFFECTS."""
    lkey = f"lock:{job.repo}@{ctx['sha'][:12]}"
    pkgs = {
        r["pkg"]
        for r in run(
            s,
            f"MATCH (l:Lockfile {{id: {gid(lkey)}}})-[:RESOLVED]->(v:Version)<-[:AFFECTS]-(a:Advisory) "
            "MATCH (v)-[:VERSION_OF]->(p:Package) RETURN p.name AS pkg",
        )
    }
    if not pkgs:
        return "no advisory-affected package resolved at the latest commit; nothing to scan"
    r = reach.scan_service(job.repo, ctx["sha"], pkgs)
    upsert_nodes(s, "File", pipeline._dedupe(r["files"]))
    job.edges["CONTAINS"] = job.edges.get("CONTAINS", 0) + upsert_edges(
        s, "CONTAINS", "Service", "File", r["contains"]
    )
    job.edges["IMPORTS"] = job.edges.get("IMPORTS", 0) + upsert_edges(
        s, "IMPORTS", "File", "Package", r["imports"]
    )
    return f"{r['scanned']} files scanned, {r['hits']} imports of {len(pkgs)} affected packages"


def edges_written() -> tuple[dict[str, int], int | None]:
    """Edge counts summed over the latest finished job per repo (a re-add replaces, not adds)
    + the last completion time."""
    total: dict[str, int] = defaultdict(int)
    last, seen = None, set()
    for j in all_jobs():  # newest first
        if j.status == "done" and j.repo not in seen:
            seen.add(j.repo)
            last = max(last or 0, j.ended_at or 0)
            for k, n in j.edges.items():
                total[k] += n
    return dict(total), last


def print_job(job: dict) -> None:
    log(f"{job['repo']}: {job['status']}")
    for st in job["steps"]:
        log(f"  {st['name']:10} {st['status']:7} {st['ms']:>8.0f} ms  {st['detail']}")


def main(argv=None) -> int:
    """`python -m reachable.jobs owner/repo` (= make add): submit through the api when it is
    up and wait for the job; otherwise run the same steps inline."""
    import argparse
    import urllib.error
    import urllib.request

    ap = argparse.ArgumentParser()
    ap.add_argument("repo")
    ap.add_argument("--api", default="http://127.0.0.1:8787")
    a = ap.parse_args(argv)
    try:
        urllib.request.urlopen(f"{a.api}/health", timeout=3).read()
    except (urllib.error.URLError, OSError):
        job = run_repo(a.repo)
        print_job(asdict(job))
        return 0 if job.status == "done" else 1
    req = urllib.request.Request(
        f"{a.api}/services/add",
        data=json.dumps({"repo": a.repo}).encode(),
        headers={"content-type": "application/json"},
    )
    try:
        r = json.load(urllib.request.urlopen(req, timeout=10))
    except urllib.error.HTTPError as e:
        r = json.load(e)
        if e.code != 409:  # 409 carries the running job's id: wait for that one
            log(f"api refused: {r.get('error')}")
            return 1
    jid = r["job_id"]
    log(f"job {jid} queued for {a.repo} (waiting)")
    while True:
        d = json.load(urllib.request.urlopen(f"{a.api}/jobs/{jid}", timeout=10))
        if d["status"] in ("done", "failed"):
            break
        time.sleep(3)
    print_job(d)
    return 0 if d["status"] == "done" else 1


if __name__ == "__main__":
    raise SystemExit(main())
