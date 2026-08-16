"""Connection helper for the local HydraDB graph-node.

Auth is basic-auth with the graph auth token as the password — that is what
HydraDB's own scripts/runtime_smoke.sh does, not a bearer scheme.
"""

import os

from neo4j import GraphDatabase

URI = os.environ.get("HYDRA_URI", "bolt://127.0.0.1:7687")
DATABASE = os.environ.get("HYDRA_DATABASE", "default")
TOKEN = os.environ.get("HYDRA_TOKEN", "local-development-token-32-bytes")


def driver():
    return GraphDatabase.driver(URI, auth=("neo4j", TOKEN))
