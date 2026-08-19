"""The MCP tool contract, asserted rather than claimed.

Pure introspection: no worker, no node, no network. What a coding agent sees before it calls
anything is the tool list, and that is what breaks silently — a renamed tool, a lost docstring, or
a mutating tool that looks read-only.
"""

import anyio
from reachable.mcp_server import mcp

READ_ONLY = {
    "exposed_services",
    "resolved_while_live",
    "affected_versions",
    "maintainer_fanout",
    "typosquats",
    "why_pulled_in",
    "who_depends_on",
    "list_services",
    "job_status",
    "find_public_victims",
    "cypher",
}
MUTATING = {"watch_repository"}


def tools():
    return {t.name: t for t in anyio.run(mcp.list_tools)}


def test_exactly_the_documented_tools():
    """README and docs/console/using.md both promise twelve, by name."""
    assert set(tools()) == READ_ONLY | MUTATING
    assert len(tools()) == 12


def test_every_tool_describes_itself():
    """The description is the only thing a model reads before choosing a tool."""
    for name, t in tools().items():
        assert t.description and len(t.description.strip()) > 40, f"{name} is under-described"


def test_the_mutating_tool_is_marked_as_such():
    """watch_repository spends GitHub API budget and writes a Service into the graph. A client
    that cannot tell it from list_services may call it speculatively."""
    ts = tools()
    assert ts["watch_repository"].annotations.read_only_hint is False
    for name in READ_ONLY:
        assert ts[name].annotations.read_only_hint is True, f"{name} should be read-only"


def test_tools_reaching_outside_the_graph_say_so():
    ts = tools()
    for name in ("find_public_victims", "watch_repository"):  # both hit GitHub
        assert ts[name].annotations.open_world_hint is True
    assert ts["cypher"].annotations.open_world_hint is False


def test_optional_argument_is_actually_optional():
    """exposed_services(advisory, service=None) — `service` narrows the answer and must not be
    demanded. A wrong schema here makes the most-used tool unusable without a service."""
    schema = tools()["exposed_services"].input_schema
    assert schema["required"] == ["advisory"]
    assert "service" in schema["properties"]


def test_cypher_tool_ships_the_schema():
    """The model cannot write a valid statement without the labels, the relationship types and the
    rule that matching happens on `key`, not on the integer id."""
    d = tools()["cypher"].description
    for token in ("RESOLVED", "DEPENDS_ON", "AFFECTS", "key"):
        assert token in d
