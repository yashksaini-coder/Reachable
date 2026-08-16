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

// ---- Services registry + ingest jobs (worker contract, docs/plans/2026-08-16-console-v2.md) ----

export type Service = {
  key: string; // svc:owner/repo
  name: string;
  repo_url: string;
  criticality: number;
  lockfiles: number;
  latest_commit: string | { sha: string; committed_at?: number; committed_at_iso?: string } | null; // worker sends the sha as a string today
  added_at?: string | number | null;
  note?: string | null;
};

export type JobStep = { name: string; status: "pending" | "running" | "done" | "failed" | "skipped"; ms: number | null; detail?: string | null };
export type Job = {
  job_id: string;
  repo: string;
  status: "queued" | "running" | "done" | "failed";
  started_at: string | number | null;
  ended_at: string | number | null;
  step: string | null;
  steps: JobStep[];
  log?: string[];
  error?: string | null;
};

export type GraphStats = {
  nodes: Record<string, number | null>;
  edges_written: Record<string, number>;
  last_ingest: string | number | null;
};

// Plain JSON round-trip; the caller decides how to degrade. Throws only on network/timeout.
async function json<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<{ status: number; body: T }> {
  const r = await fetch(`${API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(init?.timeoutMs ?? 10_000), ...init });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T };
}

export async function services(): Promise<Service[] | null> {
  try {
    const { status, body } = await json<Service[]>("/services");
    return status === 200 && Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function addService(repo: string): Promise<{ status: number; body: { job_id?: string; error?: string } }> {
  return json("/services/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo }) });
}

export async function jobs(): Promise<Job[] | null> {
  try {
    const { status, body } = await json<Job[]>("/jobs");
    return status === 200 && Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function job(id: string): Promise<{ status: number; body: Job | { error?: string } }> {
  return json(`/jobs/${encodeURIComponent(id)}`);
}

export async function graphStats(): Promise<GraphStats | null> {
  try {
    const { status, body } = await json<GraphStats>("/graph/stats");
    return status === 200 ? body : null;
  } catch {
    return null;
  }
}
