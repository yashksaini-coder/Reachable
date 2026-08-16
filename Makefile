.PHONY: venv node node-stop node-logs roundtrip probe fixture ingest incident lint test web

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

node-stop:
	-docker stop reachable-hydradb

node-logs:
	docker logs -f reachable-hydradb

roundtrip:
	$(PY) scripts/roundtrip.py

probe:
	$(PY) scripts/probe.py

fixture:
	$(PY) -m reachable.fixture

# make ingest ARGS="--only reach --only typosquats" to run selected stages
ingest:
	$(PY) -m reachable.pipeline --seeds seeds.json $(ARGS)

# make incident ID=<advisory> ARGS="--out --runs 5"  (a bare `--out` is swallowed by make as --output-sync)
incident:
	$(PY) -m reachable.incident $(ID) $(ARGS)

lint:
	$(PY) -m ruff check . && $(PY) -m ruff format --check .

test: lint
	$(PY) -m pytest -q
	@! grep -rnE "process\.env\.NEXT_PUBLIC|NEXT_PUBLIC_[A-Z_]*(HYDRA|TOKEN)" web/app web/lib web/.env* 2>/dev/null \
	  || (echo "NEXT_PUBLIC_ var found — token leak risk"; exit 1)

web:
	cd web && npm run dev

web-build:
	cd web && npm ci && npm run build
