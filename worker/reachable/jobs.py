"""Per-repo ingest jobs: one worker thread, one queue, one job at a time (single-threaded
engine access). Steps, in order: lockfiles · packages · advisories · reach · done.

    jobs.start()                 # spawn the worker thread (api.py does this)
    jobs.submit("owner/repo")    # -> Job (raises Conflict if that repo is queued/running)
    jobs.run_repo("owner/repo")  # synchronous, same steps (pipeline.py --repo)

Every job state change is appended to .cache/jobs.jsonl (last line per id wins) and
reloaded at startup so a restart still shows history; a job that was queued/running when
the process died comes back as `interrupted` and can be retried. Every job records the
edge counts it wrote — that is the only source for /graph/stats edge numbers
(whole-type edge scans time out, AGENTS.md §8).
"""

import json
import os
import queue
import threading
import time
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path

from reachable import pipeline
from reachable.db import run, session
from reachable.http import HttpError
from reachable.ids import gid
from reachable.load import log, upsert_edges, upsert_nodes
from reachable.sources import github, reach

HISTORY = Path(".cache") / "jobs.jsonl"
STEPS = ["lockfiles", "packages", "advisories", "reach"]
TERMINAL = ("done", "failed", "interrupted")
INTERRUPTED = "the worker restarted while this job was running — retry re-runs it idempotently"


class Conflict(Exception):
    pass


@dataclass
class Job:
    job_id: str
    repo: str
    criticality: int = 1
    status: str = "queued"  # queued | running | done | failed | interrupted
    started_at: int | None = None
    ended_at: int | None = None
    step: str | None = None
    error: str | None = None  # the failure reason, verbatim — the console shows it next to "failed"
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


_FIELDS = {f.name for f in fields(Job)}


def _load_history() -> None:
    """Replay the log; tolerant to lines from older/newer schemas. Anything not terminal was
    cut off by a restart: mark it interrupted (with its last known step) and persist that."""
    if not HISTORY.exists():
        return
    for line in HISTORY.read_text().splitlines():
        if not line.strip():
            continue
        try:
            d = json.loads(line)
            job = Job(**{k: v for k, v in d.items() if k in _FIELDS})
        except (ValueError, TypeError) as e:
            log(f"jobs: skipping unreadable history line ({e})")
            continue
        _jobs[job.job_id] = job
    for job in _jobs.values():
        if job.status not in TERMINAL:
            if job.steps and job.steps[-1]["status"] == "running":
                job.steps[-1]["status"] = "failed"
            job.status, job.error = "interrupted", INTERRUPTED
            job.ended_at = job.ended_at or int(time.time())
            job.say("interrupted by a worker restart")
            _persist(job)


def _persist(job: Job) -> None:
    try:
        HISTORY.parent.mkdir(exist_ok=True)
        with HISTORY.open("a") as f:
            f.write(json.dumps(asdict(job)) + "\n")
    except OSError as e:  # a full disk must not take the worker thread down
        log(f"jobs: could not persist {job.job_id[:8]}: {e}")


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
        except Exception as e:  # noqa: BLE001 — the loop outlives any single job
            log(f"jobs: worker error on {job.job_id[:8]}: {e!s:.300}")
        finally:
            _q.task_done()


def submit(repo: str, criticality: int = 1) -> Job:
    with _lock:
        for j in _jobs.values():
            if j.repo == repo and j.status in ("queued", "running"):
                raise Conflict(j.job_id)
        job = Job(job_id=uuid.uuid4().hex, repo=repo, criticality=criticality)
        _jobs[job.job_id] = job
    _persist(job)  # queued: a restart before it starts still shows it (as interrupted)
    _q.put(job)
    return job


def retry(job_id: str) -> Job:
    """Re-submit a finished/failed/interrupted job's repo with the same criticality."""
    old = get(job_id)
    if old is None:
        raise KeyError(job_id)
    return submit(old.repo, old.criticality)


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
    _persist(job)
    try:
        with session() as s:
            ctx: dict = {}
            for name in STEPS:
                job.step = name
                # ms is None while running: the console shows "—", never a fake 0.00 ms
                st = {"name": name, "status": "running", "ms": None, "detail": ""}
                job.steps.append(st)
                ctx["step"] = st  # stages update st["detail"] with live i/n progress
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
        job.error = f"{e!s:.400}"
        job.say(f"failed: {e!s:.400}")
    finally:
        job.ended_at = int(time.time())
        _persist(job)


def _lockfile_error(repo: str, r: dict) -> str:
    found = github.root_lockfiles(repo)
    other = [f for f in found if f in github.UNSUPPORTED]
    if other:
        return (
            f"found {other[0]} — {other[0].split('.')[0]} is not supported yet "
            "(npm package-lock.json v2/v3 and pnpm-lock.yaml v6/v9 are)"
        )
    if r["lockfile_path"] is None:
        return (
            "no package-lock.json or pnpm-lock.yaml in this repository's root history — "
            "no root lockfile; monorepo sub-directories are not scanned yet"
        )
    return (
        f"{r['lockfile_path']} exists but no commit carried a supported version "
        "(npm lockfileVersion 2/3, pnpm 6.x/9.x) — "
        f"{len(r['skipped_snapshots'])} snapshots skipped"
    )


def step_lockfiles(s, job: Job, ctx: dict) -> str:
    # yearly cutoffs + the 24 most recent lockfile commits: dense recent history so a narrow
    # incident window (95 min for chalk@5.6.1) has a chance of a snapshot inside it.
    try:
        r = github.ingest_service(
            job.repo, job.criticality, pipeline.yearly_cutoffs(), [], recent=24
        )
    except HttpError as e:
        if e.status == 404:
            raise RuntimeError(
                "repository not found or private — set GITHUB_TOKEN with repo scope"
            ) from e
        if e.status in (401, 403):
            raise RuntimeError(
                f"GitHub rate limit or token scope (HTTP {e.status}) — set GITHUB_TOKEN or wait"
            ) from e
        raise
    if not r["lockfiles"]:
        raise RuntimeError(_lockfile_error(job.repo, r))
    r["service"]["added_at"] = int(time.time())
    for k, n in pipeline.write_service(s, r).items():
        job.edges[k] = job.edges.get(k, 0) + n
    ctx["touched"] = pipeline.versions_of(r)
    latest = max(r["lockfiles"], key=lambda lf: lf["committed_at"])
    ctx["sha"] = latest["sha"]
    return (
        f"{len(r['lockfiles'])} {r['lockfile_path']} commits, {len(r['versions'])} versions, "
        f"{len(r['resolved'])} RESOLVED, {len(r['depends_on'])} DEPENDS_ON, "
        f"{len(r['skipped_snapshots'])} snapshots skipped"
    )


def step_packages(s, job: Job, ctx: dict) -> str:
    touched = ctx["touched"]
    ctx["known"] = pipeline.stage_packages(s, sorted(touched), keep=touched, step=ctx["step"])
    return f"{len(ctx['known'])} packages from npm, {sum(len(v) for v in touched.values())} versions kept"


def step_advisories(s, job: Job, ctx: dict) -> str:
    pairs = sorted((n, v) for n, vs in ctx["touched"].items() for v in vs)
    c = pipeline.ingest_advisories(s, pairs, ctx["known"], step=ctx["step"])
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
    # source_files is disk-cached, so listing here for the progress line costs nothing
    ctx["step"]["detail"] = (
        f"scanning {len(reach.source_files(job.repo, ctx['sha']))} files for {len(pkgs)} packages"
    )
    r = reach.scan_service(job.repo, ctx["sha"], pkgs, step=ctx.get("step"))
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
        ms = f"{st['ms']:>8.0f}" if st["ms"] is not None else f"{'—':>8}"
        log(f"  {st['name']:10} {st['status']:7} {ms} ms  {st['detail']}")


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
    key = os.environ.get("REACHABLE_API_KEY", "").strip()
    auth = {"authorization": f"Bearer {key}"} if key else {}
    try:
        urllib.request.urlopen(f"{a.api}/health", timeout=3).read()
    except (urllib.error.URLError, OSError):
        job = run_repo(a.repo)
        print_job(asdict(job))
        return 0 if job.status == "done" else 1
    req = urllib.request.Request(
        f"{a.api}/services/add",
        data=json.dumps({"repo": a.repo}).encode(),
        headers={"content-type": "application/json", **auth},
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
        d = json.load(
            urllib.request.urlopen(
                urllib.request.Request(f"{a.api}/jobs/{jid}", headers=auth), timeout=10
            )
        )
        if d["status"] in TERMINAL:
            break
        time.sleep(3)
    print_job(d)
    return 0 if d["status"] == "done" else 1


if __name__ == "__main__":
    raise SystemExit(main())
