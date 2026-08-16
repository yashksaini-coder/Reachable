"""NAME_SIMILAR_TO rows: suspect package -> popular package it could be squatting.

Pure computation. Kinds, checked in this order, first match wins per pair:
scope, hyphen, homoglyph, prefix_suffix, then one OSA edit (transposition /
insertion / deletion / substitution), then edit2 (popular >= 8 chars only).
Popular names < 4 chars are never targets. Two popular names never pair.
"""

import re
import time
from collections import defaultdict

from reachable.ids import pkg_key
from reachable.load import log

SUFFIXES = ("-js", "js", ".js", "-node", "node", "-cli", "-lib", "-lite", "2", "3")
PREFIXES = ("node-", "npm-", "js-")
_HG = [("rn", "m"), ("vv", "w"), ("0", "o"), ("1", "l"), ("i", "l")]
_PUNCT = re.compile(r"[-_.]")


def _bare(s: str) -> str:
    return s.split("/", 1)[1] if s.startswith("@") and "/" in s else s


def _hy(s: str) -> str:
    return _PUNCT.sub("", s)


def _hg(s: str) -> str:
    for a, b in _HG:
        s = s.replace(a, b)
    return s


def _dels(s: str, d: int) -> set[str]:
    """s plus every string reachable by deleting up to d chars (SymSpell candidate index)."""
    out, frontier = {s}, {s}
    for _ in range(d):
        frontier = {w[:i] + w[i + 1 :] for w in frontier for i in range(len(w))}
        out |= frontier
    return out


def osa(a: str, b: str) -> int:
    """Damerau-Levenshtein, optimal string alignment variant."""
    la, lb = len(a), len(b)
    prev2, prev, cur = None, list(range(lb + 1)), None
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        prev2, prev = prev, cur
    return prev[lb]


def _edit_kind(s: str, p: str) -> str:
    if len(s) == len(p) + 1:
        return "insertion"
    if len(s) == len(p) - 1:
        return "deletion"
    diff = [i for i in range(len(s)) if s[i] != p[i]]
    if len(diff) == 2 and diff[1] == diff[0] + 1 and s[diff[0]] == p[diff[1]] and s[diff[1]] == p[diff[0]]:
        return "transposition"
    return "substitution"


def _kind(s: str, p: str) -> tuple[str, int] | None:
    if _bare(s) == _bare(p):
        return "scope", 1
    if _hy(s) == _hy(p):
        return "hyphen", 1
    if _hg(s) == _hg(p):
        return "homoglyph", 1
    if any(s == p + x for x in SUFFIXES) or any(s == x + p for x in PREFIXES):
        return "prefix_suffix", 1
    if abs(len(s) - len(p)) <= 2:
        d = osa(s, p)
        if d == 1:
            return _edit_kind(s, p), 1
        if d == 2 and len(p) >= 8:
            return "edit2", 2
    return None


def similar_names(names: list[str], popular: set[str]) -> list[dict]:
    """NAME_SIMILAR_TO rows {src: suspect pkg key, dst: popular pkg key, distance, kind}, sorted."""
    pop = sorted(p for p in popular if len(p) >= 4)
    by_bare, by_hy, by_hg, by_del = (defaultdict(set) for _ in range(4))
    for p in pop:
        by_bare[_bare(p)].add(p)
        by_hy[_hy(p)].add(p)
        by_hg[_hg(p)].add(p)
        for f in _dels(p, 2 if len(p) >= 8 else 1):
            by_del[f].add(p)

    rows = []
    for s in sorted(set(names) - popular):
        cands = set(by_bare.get(_bare(s), ())) | by_hy.get(_hy(s), set()) | by_hg.get(_hg(s), set())
        for x in SUFFIXES:
            if s.endswith(x) and s[: -len(x)] in popular:
                cands.add(s[: -len(x)])
        for x in PREFIXES:
            if s.startswith(x) and s[len(x) :] in popular:
                cands.add(s[len(x) :])
        for f in _dels(s, 2 if len(s) >= 6 else 1):
            cands |= by_del.get(f, set())
        for p in cands:
            if p == s or len(p) < 4:
                continue
            k = _kind(s, p)
            if k is None:
                continue
            try:
                rows.append({"src": pkg_key(s), "dst": pkg_key(p), "distance": k[1], "kind": k[0]})
            except ValueError as e:
                log(f"typosquat: skip {e}")
    rows.sort(key=lambda r: (r["src"], r["dst"]))
    return rows


if __name__ == "__main__":
    names = ["chalk", "chalks", "chalkk", "chlak", "chalk-js", "cross-env", "crossenv", "cr0ss-env", "lodash", "lodahs",
             "@types/lodash", "expres", "express", "colors", "color", "ms", "mss", "event-stream", "eventstream"]  # fmt: skip
    popular = {"chalk", "cross-env", "lodash", "express", "colors", "event-stream", "ms"}
    t0 = time.perf_counter()
    rows = similar_names(names, popular)
    ms = (time.perf_counter() - t0) * 1000
    got = {(r["src"][8:], r["dst"][8:]): (r["kind"], r["distance"]) for r in rows}
    for s, p, kind in [
        ("chalks", "chalk", "insertion"),
        ("chlak", "chalk", "transposition"),
        ("crossenv", "cross-env", "hyphen"),
        ("cr0ss-env", "cross-env", "homoglyph"),
        ("lodahs", "lodash", "transposition"),
        ("expres", "express", "deletion"),
        ("chalk-js", "chalk", "prefix_suffix"),
        ("eventstream", "event-stream", "hyphen"),
        ("@types/lodash", "lodash", "scope"),
        ("color", "colors", "deletion"),
    ]:
        assert got.get((s, p)) == (kind, 1), (s, p, got.get((s, p)))
    assert ("mss", "ms") not in got
    assert not any(s in popular for s, _ in got), "popular names must not be suspects"
    assert ("chalk", "express") not in got and ("express", "chalk") not in got
    assert all(r["dst"][8:] in popular for r in rows)
    assert osa("ca", "abc") == 3 and osa("abcd", "acbd") == 1
    assert rows == sorted(rows, key=lambda r: (r["src"], r["dst"]))

    # scale check: ~10k synthetic names against ~2000 popular
    import random

    rng = random.Random(1)
    big_pop = {"".join(rng.choices("abcdefghijklmnopqrstuvwxyz-", k=rng.randint(4, 14))) for _ in range(2000)}
    big_names = list(big_pop)[:1000] + [
        p[:i] + p[i + 1 :] for p in list(big_pop)[:3000] for i in (1,)
    ] + ["".join(rng.choices("abcdefghijklmnopqrstuvwxyz-", k=rng.randint(4, 20))) for _ in range(6000)]
    t1 = time.perf_counter()
    big = similar_names(big_names, big_pop)
    big_ms = (time.perf_counter() - t1) * 1000
    print(f"typosquat ok: edges={len(rows)} elapsed={ms:.1f}ms | scale: names={len(big_names)} popular={len(big_pop)} edges={len(big)} elapsed={big_ms:.0f}ms")
