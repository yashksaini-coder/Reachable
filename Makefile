.PHONY: mcp venv node node-test node-test-stop node-stop node-logs roundtrip probe fixture ingest incident lint test api web web-build up down add reset demo

DATA    := $(CURDIR)/.hydradb
PY      := $(CURDIR)/.venv/bin/python
IMAGE   := ghcr.io/hydra-db/hydradb:latest
# Token: from .env (HYDRA_TOKEN) if present, else the local dev default. The node and the
# worker must agree — both read the same .env.
TOKEN   ?= $(shell grep -E '^HYDRA_TOKEN=' .env 2>/dev/null | cut -d= -f2- | tr -d "\"'" || true)
ifeq ($(strip $(TOKEN)),)
TOKEN   := local-development-token-32-bytes
endif
export PYTHONPATH := $(CURDIR)/worker

# .venv and .hydradb are gitignored, so a clean checkout has neither.
venv:
	python3 -m venv .venv && $(PY) -m pip install -qr requirements.txt

# Runs in the foreground and does not return — that is it working, not hanging.
# Use a second shell for everything else.
node:
	@mkdir -p $(DATA)/store $(DATA)/cache
	@printf '%s\n' '$(TOKEN)' > $(DATA)/auth-token
	docker run --rm --name reachable-hydradb \
	  --user "$$(id -u):$$(id -g)" \
	  -p 127.0.0.1:7687:7687 -p 127.0.0.1:8443:8443 -p 127.0.0.1:9090:9090 \
	  -v "$(DATA):/data" \
	  -e CLOUD_PROVIDER=local \
	  -e LOCAL_PATH=/data/store \
	  -e GRAPH_NAMESPACE=default \
	  -e GRAPH_ID=default \
	  -e GRAPH_CELL_ID=cell-0 \
	  -e GRAPH_CELLS=cell-0 \
	  -e GRAPH_NODE_ID=node-0 \
	  -e GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:7687 \
	  -e GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:7687 \
	  -e GRAPH_DATA_CACHE_DIR=/data/cache \
	  -e GRAPH_AUTH_TOKEN_FILE=/data/auth-token \
	  -e GRAPH_ALLOW_PLAINTEXT=true \
	  -e RUST_MIN_STACK=33554432 \
	  $(IMAGE)

# Separate node for the golden tests, so the fixture never lands in the production graph
# (node deletion scans every relationship and is refused past 1M edges — a fixture cannot be
# removed once loaded). Detached, own ports and store, dev token.
TEST_DATA := $(CURDIR)/.hydradb-test
node-test:
	@mkdir -p $(TEST_DATA)/store $(TEST_DATA)/cache
	@printf '%s\n' 'local-development-token-32-bytes' > $(TEST_DATA)/auth-token
	docker run -d --rm --name reachable-hydradb-test \
	  --user "$$(id -u):$$(id -g)" \
	  -p 127.0.0.1:17687:7687 -p 127.0.0.1:18443:8443 -p 127.0.0.1:19090:9090 \
	  -v "$(TEST_DATA):/data" \
	  -e CLOUD_PROVIDER=local -e LOCAL_PATH=/data/store \
	  -e GRAPH_NAMESPACE=default -e GRAPH_ID=default -e GRAPH_CELL_ID=cell-0 -e GRAPH_CELLS=cell-0 \
	  -e GRAPH_NODE_ID=node-0 -e GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:7687 \
	  -e GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:7687 -e GRAPH_DATA_CACHE_DIR=/data/cache \
	  -e GRAPH_AUTH_TOKEN_FILE=/data/auth-token -e GRAPH_ALLOW_PLAINTEXT=true \
	  -e RUST_MIN_STACK=33554432 $(IMAGE)
	@for i in $$(seq 1 30); do curl -sf http://127.0.0.1:19090/readyz >/dev/null 2>&1 && break; sleep 1; done; echo "test node ready on 17687"

node-test-stop:
	-docker stop reachable-hydradb-test

node-stop:
	-docker stop reachable-hydradb

node-logs:
	docker logs -f reachable-hydradb

roundtrip:
	$(PY) scripts/roundtrip.py

probe:
	$(PY) scripts/probe.py

fixture:   # loads into the TEST node only
	HYDRA_URI=bolt://127.0.0.1:17687 HYDRA_TOKEN=local-development-token-32-bytes $(PY) -m reachable.fixture

# make ingest ARGS="--only reach --only typosquats" to run selected stages over demo/services.txt
# (bulk path; the per-repo path is `make add`)
ingest:
	$(PY) -m reachable.pipeline --seeds demo/services.txt $(ARGS)

# make incident ID=<advisory> ARGS="--out --runs 5"  (a bare `--out` is swallowed by make as --output-sync)
incident:
	$(PY) -m reachable.incident $(ID) $(ARGS)

lint:
	$(PY) -m ruff check . && $(PY) -m ruff format --check .

# Tests use the TEST node (make node-test) — never the production graph.
test: lint
	@curl -sf http://127.0.0.1:19090/readyz >/dev/null 2>&1 || (echo "test node not running: make node-test"; exit 1)
	HYDRA_URI=bolt://127.0.0.1:17687 HYDRA_TOKEN=local-development-token-32-bytes $(PY) -m pytest -q
	@! grep -rnE "process\.env\.NEXT_PUBLIC|NEXT_PUBLIC_[A-Z_]*(HYDRA|TOKEN)" web/app web/lib web/.env* 2>/dev/null \
	  || (echo "NEXT_PUBLIC_ var found — token leak risk"; exit 1)

api:
	$(PY) -m reachable.api

# MCP (stdio) server for coding agents; needs `make api` running. Registered for Claude Code
# via .mcp.json; other agents: command .venv/bin/python, args -m reachable.mcp_server, PYTHONPATH=worker
mcp:
	$(PY) -m reachable.mcp_server

web:
	cd web && npm run dev

web-build:
	cd web && npm ci && npm run build

# ---------------------------------------------------------------- setup: up / down / add / reset / demo

API := http://127.0.0.1:8787

# api in the background (pid in .cache/api.pid) + production web build; the node stays in
# its own terminal (`make node`).
up:
	@$(PY) -c "import socket; socket.create_connection(('127.0.0.1', 7687), 2)" 2>/dev/null \
	  || { echo "HydraDB is not listening on :7687 — run make node in another terminal"; exit 1; }
	@mkdir -p .cache
	@if curl -sf $(API)/health >/dev/null; then echo "api already up on $(API)"; else \
	  ($(PY) -u -m reachable.api > .cache/api.log 2>&1 & echo $$! > .cache/api.pid); \
	  sleep 2; echo "api on $(API) (pid $$(cat .cache/api.pid), log .cache/api.log)"; fi
	cd web && npm run build && npm start

down:
	-@kill $$(cat .cache/api.pid 2>/dev/null) 2>/dev/null && echo "api stopped"; rm -f .cache/api.pid

# make add REPO=owner/repo  — an ingest job via the api if it is up (waits for it), else the
# same steps inline (python -m reachable.pipeline --repo)
add:
	@test -n "$(REPO)" || { echo "usage: make add REPO=owner/repo"; exit 1; }
	$(PY) -m reachable.jobs --api $(API) $(REPO)

# stop the node and archive its store + cache; then `make node` starts empty
reset:
	-docker stop reachable-hydradb
	@T=$$(date +%Y%m%d-%H%M%S); for d in store cache; do \
	  test -d $(DATA)/$$d && mv $(DATA)/$$d $(DATA)/$$d.old-$$T && echo "archived $(DATA)/$$d -> $$d.old-$$T"; done; true
	@echo "now run make node"

# replay demo/services.txt (jobs) and demo/incidents.txt (reports)
demo:
	@grep -vE '^\s*(#|$$)' demo/services.txt | while read -r repo _; do $(MAKE) --no-print-directory add REPO=$$repo; done
	@grep -vE '^\s*(#|$$)' demo/incidents.txt | while read -r id _; do $(MAKE) --no-print-directory incident ID=$$id ARGS="--out --runs 5"; done
