import { workerHealth } from "@/lib/api";
import { env } from "@/lib/env";
import { listIncidents } from "@/lib/incident";

// Health for an uptime monitor and for the sidebar status light. Reports the committed-JSON gallery
// (always), and liveness of the graph by whichever route this deployment can actually observe:
//   - the worker's /health, which runs a Cypher count against the node — so a 200 proves the graph
//     answered. This is the only proof available once the node has no public port.
//   - HydraDB's own /healthz, reachable only where HYDRA_TOKEN says a node is directly addressable
//     (local development). Unset is a configuration, not a fault.
// It never claims "live" it did not observe, and never reports a deliberate configuration as a
// failure — the caller distinguishes "not wired up" from "wired up and not answering".
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
