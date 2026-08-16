"""Write primitives: batched UNWIND MERGE, idempotent by construction (deterministic ids).

Two functions are the whole write API. Everything the sources produce is plain
dicts matching docs/schema.md; this module never knows what a Package is.

    upsert_nodes(s, "Version", [{"key": ..., "version": ..., ...}])
    upsert_edges(s, "RESOLVED", "Lockfile", "Version", [{"src": key, "dst": key, "at": ...}])

Engine rules enforced here (AGENTS.md §8): MERGE pattern matches id only, label
via SET, every SET value from the row map, exactly one label per edge endpoint,
<= 1000 rows per statement, ids as 52-bit ints, key/eid mirrors.
"""

import sys
from collections.abc import Iterable

from reachable.db import run
from reachable.ids import eid, gid

BATCH = 1000  # engine hard cap is 1024

# gid -> key. Raises on the one-in-ten-thousand hash collision before it becomes a wrong answer.
_seen: dict[int, str] = {}


def _gid(key: str) -> int:
    g = gid(key)
    prev = _seen.setdefault(g, key)
    if prev != key:
        raise RuntimeError(f"id collision: {prev!r} vs {key!r} -> {g}")
    return g


def _batches(rows: list[dict]) -> Iterable[list[dict]]:
    for i in range(0, len(rows), BATCH):
        yield rows[i : i + BATCH]


def _check(rows: list[dict], label: str) -> None:
    """Timestamps must be ints; a string in an int column errors the whole query later."""
    for r in rows:
        for k, v in r.items():
            is_ts = k.endswith(("_at", "_from", "_to")) or k == "at"
            if is_ts and v is not None and not isinstance(v, int):
                raise TypeError(f"{label}.{k} must be int epoch, got {type(v).__name__}: {v!r}")


def upsert_nodes(s, label: str, rows: list[dict]) -> int:
    """rows: dicts with 'key' + properties. Property set is taken from the union of keys."""
    if not rows:
        return 0
    _check(rows, label)
    keys = sorted({k for r in rows for k in r} - {"id"})
    assert "key" in keys, f"{label} rows need a 'key'"
    sets = ", ".join(f"n.{k} = row.{k}" for k in keys)
    q = f"UNWIND $rows AS row MERGE (n {{id: row.id}}) SET n:{label}, {sets}"
    n = 0
    for batch in _batches(rows):
        # every row must carry every key: missing -> None, which the engine stores as null
        full = [{"id": _gid(r["key"]), **{k: r.get(k) for k in keys}} for r in batch]
        run(s, q, rows=full)
        n += len(full)
    return n


def upsert_edges(s, rel_type: str, src_label: str, dst_label: str, rows: list[dict]) -> int:
    """rows: dicts with 'src', 'dst' (human keys) + edge properties."""
    if not rows:
        return 0
    _check(rows, rel_type)
    props = sorted({k for r in rows for k in r} - {"src", "dst", "id", "rid"})
    sets = ", ".join(["r.eid = row.rid"] + [f"r.{k} = row.{k}" for k in props])
    q = (
        f"UNWIND $rows AS row MATCH (a:{src_label} {{id: row.src}}), (b:{dst_label} {{id: row.dst}}) "
        f"MERGE (a)-[r:{rel_type} {{id: row.rid}}]->(b) SET {sets}"
    )
    n = 0
    for batch in _batches(rows):
        full = [
            {
                "src": _gid(r["src"]),
                "dst": _gid(r["dst"]),
                "rid": eid(r["src"], rel_type, r["dst"]),
                **{k: r.get(k) for k in props},
            }
            for r in batch
        ]
        run(s, q, rows=full)
        n += len(full)
    return n


def delete_nodes(s, keys: list[str]) -> None:
    for batch in _batches([{"id": gid(k)} for k in keys]):
        run(s, "UNWIND $rows AS row MATCH (n {id: row.id}) DETACH DELETE n", rows=batch)


def count(s, label: str) -> int:
    return run(s, f"MATCH (n:{label}) RETURN count(*) AS c")[0]["c"]


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)
