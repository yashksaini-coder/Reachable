.PHONY: node node-stop node-logs roundtrip probe test

DATA    := $(CURDIR)/.hydradb
PY      := $(CURDIR)/.venv/bin/python
IMAGE   := ghcr.io/hydra-db/hydradb:latest
# Local dev token only. Real deployments read it from the environment.
TOKEN   ?= local-development-token-32-bytes

# Runs in the foreground and does not return — that is it working, not hanging.
# Use a second shell for everything else.
node:
	@mkdir -p $(DATA)/store $(DATA)/cache
	@printf '%s\n' '$(TOKEN)' > $(DATA)/auth-token
	docker run --rm --name reachable-hydradb \
	  --user "$$(id -u):$$(id -g)" \
	  -p 7687:7687 -p 8443:8443 -p 9090:9090 \
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
	PYTHONPATH=scripts $(PY) scripts/roundtrip.py

probe:
	PYTHONPATH=scripts $(PY) scripts/probe.py

test:
	@echo "no tests yet — Phase 1"
