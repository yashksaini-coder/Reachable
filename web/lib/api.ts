import "server-only";

// The live query API (worker/reachable/api.py). Loopback by default; on a read-only deploy it
// is simply unreachable and every live feature degrades to "unavailable" — never to a lie.
const API = process.env.REACHABLE_API_URL ?? "http://127.0.0.1:8787";
// Server-only: when the worker is remote it requires a bearer key; the browser never sees it.
const KEY = process.env.REACHABLE_API_KEY;
const AUTH: HeadersInit = KEY ? { authorization: `Bearer ${KEY}` } : {};

export type Live<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  data?: T & { cypher?: string[]; ms?: number; limitations?: string[]; rows?: unknown[]; meta?: Record<string, unknown>; total_ms?: number };
  error?: string;
};

export async function live<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<Live<T>> {
  const qs = new URLSearchParams(params).toString();
  try {
    const r = await fetch(`${API}${path}?${qs}`, { cache: "no-store", headers: AUTH, signal: AbortSignal.timeout(35_000) });
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

// Same probe, keeping the count. The worker's /health runs a Cypher count, so a 200 is proof the
// graph answered — the only proof available when the node has no public port. Unauthenticated on
// purpose: /health is exempt, so the status light survives a key rotation.
export async function workerHealth(): Promise<{ up: boolean; services: number | null }> {
  try {
    const r = await fetch(`${API}/health`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { up: false, services: null };
    const b = (await r.json()) as { services?: number };
    return { up: true, services: typeof b.services === "number" ? b.services : null };
  } catch {
    return { up: false, services: null };
  }
}

// ---- Services registry + ingest jobs (worker contract) ----

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
  status: "queued" | "running" | "done" | "failed" | "interrupted"; // interrupted = the worker restarted mid-job
  started_at: string | number | null;
  ended_at: string | number | null;
  step: string | null;
  steps: JobStep[];
  log?: string[];
  error?: string | null; // failure reason verbatim (also set on interrupted)
};

export type GraphStats = {
  nodes: Record<string, number | null>;
  edges_written: Record<string, number>;
  last_ingest: string | number | null;
};

// Plain JSON round-trip; the caller decides how to degrade. Throws only on network/timeout.
async function json<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<{ status: number; body: T }> {
  // Headers, not an object spread: header names are case-insensitive on the wire but distinct keys
  // in an object, so a caller's `Authorization` would sit *beside* the default `authorization`
  // instead of replacing it — and the caller's intent would silently lose.
  const headers = new Headers(AUTH);
  for (const [k, v] of Object.entries((init?.headers as Record<string, string>) ?? {})) headers.set(k, v);
  const r = await fetch(`${API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(init?.timeoutMs ?? 10_000), ...init, headers });
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

// Re-submits the job's repo (same criticality); 409 carries the id of the job already running.
export async function retryJob(id: string): Promise<{ status: number; body: { job_id?: string; repo?: string; error?: string } }> {
  return json(`/jobs/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export type MintedKey = { token?: string; name?: string; scope?: string; ttl_days?: number; expires_at?: number; error?: string };

// Mints a read-only, expiring key at the worker. The token comes back once and is never stored here.
export async function mintKey(name: string): Promise<{ status: number; body: MintedKey }> {
  try {
    return await json<MintedKey>("/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
  } catch {
    return { status: 503, body: { error: "the worker did not answer" } };
  }
}

/** Revoke a minted key. The caller's own token is the proof of ownership, so it goes on the wire
 *  instead of the operator key — this is the one write a read-only key is allowed to make. */
export async function revokeKey(token: string): Promise<{ status: number; body: { revoked?: boolean; error?: string } }> {
  try {
    return await json<{ revoked?: boolean; error?: string }>("/keys", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { status: 503, body: { error: "the worker did not answer" } };
  }
}

export async function graphStats(): Promise<GraphStats | null> {
  try {
    const { status, body } = await json<GraphStats>("/graph/stats");
    return status === 200 ? body : null;
  } catch {
    return null;
  }
}
