import { workerHealth } from "@/lib/api";
import { env } from "@/lib/env";
import { listIncidents } from "@/lib/incident";

// Health for uptime monitors and the sidebar status light. Always reports the committed-JSON
// gallery; for liveness it uses whichever route this deployment can observe — the worker's /health
// (which runs a Cypher count, so a 200 proves the graph answered) and, where HYDRA_TOKEN says a
// node is directly addressable, its /healthz. Never claims what it did not observe, and keeps
// "not wired up" distinct from "wired up and silent".
export const dynamic = "force-dynamic";

export async function GET() {
  const incidents = (await listIncidents()).map((i) => i.advisory.key);

  let hydradb: "unconfigured" | "up" | "down" = "unconfigured";
  if (env.HYDRA_TOKEN) {
    try {
      const r = await fetch(`${env.HYDRA_HTTP_URL.replace(/\/$/, "")}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
      hydradb = r.ok ? "up" : "down";
    } catch {
      hydradb = "down";
    }
  }

  // Always probe — the default is loopback, where `make up` puts a worker. What differs is how a
  // failure reads: an explicitly configured worker that will not answer is a fault, while nothing
  // on loopback just means this deployment serves committed reports, which is a choice.
  const declared = Boolean(process.env.REACHABLE_API_URL);
  const probe = await workerHealth();
  const worker: "unconfigured" | "up" | "down" = probe.up ? "up" : declared ? "down" : "unconfigured";

  return Response.json({
    ok: true,
    incidents,
    hydradb,
    worker,
    services: probe.services,
    generated_at: new Date().toISOString(),
  });
}
