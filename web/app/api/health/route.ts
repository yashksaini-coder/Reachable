import { env } from "@/lib/env";
import { listIncidents } from "@/lib/incident";

// Health for an uptime monitor. Reports the committed-JSON gallery (always) and whether the
// HydraDB HTTP endpoint answers (only if configured). It never claims "live" it did not observe.
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
  return Response.json({ ok: true, incidents, hydradb, generated_at: new Date().toISOString() });
}
