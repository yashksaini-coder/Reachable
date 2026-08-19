"""Minted keys are weaker than the operator key, and provably so.

Minting is open by design, so the guarantees that make that safe are the ones worth pinning: a
minted key reads and cannot write, it expires, minting is rate-limited, and the store holds no
usable token.
"""

import json

import pytest
from reachable import keys


@pytest.fixture(autouse=True)
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(keys, "STORE", tmp_path / "keys.json")
    return tmp_path / "keys.json"


def test_minted_key_is_read_only():
    """The whole reason minting can be self-serve: it cannot queue an ingest."""
    rec = keys.mint("reviewer", "1.2.3.4")
    assert rec["scope"] == "read"
    assert keys.check(rec["token"])["scope"] == "read"


def test_token_is_not_recoverable_from_the_store(store):
    rec = keys.mint("reviewer", "1.2.3.4")
    on_disk = store.read_text()
    assert rec["token"] not in on_disk, "a leaked keys.json must not yield a usable key"
    assert json.loads(on_disk)["keys"], "the hash is stored"


def test_expired_key_stops_working(monkeypatch):
    rec = keys.mint("reviewer", "1.2.3.4")
    assert keys.check(rec["token"]) is not None
    monkeypatch.setattr(keys.time, "time", lambda: rec["expires_at"] + 1)
    assert keys.check(rec["token"]) is None, "a key past its TTL must not authenticate"


def test_wrong_token_is_rejected():
    keys.mint("reviewer", "1.2.3.4")
    assert keys.check("rk_not_a_real_key") is None
    assert keys.check("") is None


def test_minting_is_rate_limited_per_client():
    for _ in range(keys.PER_CLIENT_HOUR):
        keys.mint("x", "9.9.9.9")
    with pytest.raises(keys.Refused):
        keys.mint("x", "9.9.9.9")
    # a different client is unaffected
    assert keys.mint("y", "8.8.8.8")["scope"] == "read"


def test_active_count_is_reported():
    keys.mint("a", "1.1.1.1")
    keys.mint("b", "1.1.1.1")
    s = keys.stats()
    assert s["active"] == 2 and s["scope"] == "read" and s["ttl_days"] == keys.TTL_DAYS
