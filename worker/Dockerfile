# Reachable worker: the ingest jobs + the read-only query API on :8787. Talks to HydraDB over Bolt.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/worker
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY worker ./worker
COPY demo ./demo
COPY worker/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# jobs history + HTTP cache live under /app/.cache (a volume in compose)
RUN mkdir -p /app/.cache /app/worker/out /app/benchmarks/results
EXPOSE 8787
CMD ["/entrypoint.sh"]
