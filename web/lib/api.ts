import "server-only";

// The live query API (worker/reachable/api.py). Loopback by default; on a read-only deploy it
// is simply unreachable and every live feature degrades to "unavailable" — never to a lie.
const API = process.env.REACHABLE_API_URL ?? "http://127.0.0.1:8787";

export type Live<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  data?: T & { cypher?: string[]; ms?: number; limitations?: string[]; rows?: unknown[]; meta?: Record<string, unknown>; total_ms?: number };
  error?: string;
};

export async function live<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<Live<T>> {
  const qs = new URLSearchParams(params).toString();
  try {
    const r = await fetch(`${API}${path}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(35_000) });
    const data = (await r.json()) as Live<T>["data"] & { error?: string };
    if (!r.ok) return { ok: false, status: r.status, error: data?.error ?? `HTTP ${r.status}` };
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error && e.name === "TimeoutError" ? "query timed out" : "live API unavailable" };
  }
}

export async function apiHealthy(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/health`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}
