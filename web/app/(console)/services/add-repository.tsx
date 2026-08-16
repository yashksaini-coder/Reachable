"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import type { Job, JobStep } from "@/lib/api";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/console/toast";

const SLUG = /^[\w.-]+\/[\w.-]+$/;
const normalise = (raw: string) => {
  const s = raw.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "").split("/").slice(0, 2).join("/");
  return SLUG.test(s) ? s : null;
};

// Renders the two cells of the /services top row: the add-repository card (with the running
// JobCard beneath it) and the recent-jobs card. The page owns the grid.
export function AddRepository({ disabled, recent, prominent = false }: { disabled: boolean; recent: Job[]; prominent?: boolean }) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "note" } | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  // Re-submits a finished/failed/interrupted job's repo; attaches to the new (or already running) job.
  async function retry(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(id)}/retry`, { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as { job_id?: string; error?: string };
      if (body.job_id && (r.ok || r.status === 409)) {
        setJobId(body.job_id);
        setMsg(r.status === 409 ? { text: "an ingest is already running — attached to it", tone: "note" } : { text: `retrying · job ${body.job_id.slice(0, 8)}`, tone: "note" });
      } else {
        toast.error("could not retry the job", body.error ?? `HTTP ${r.status}`);
      }
    } catch {
      toast.error("live API unavailable", "the worker on :8787 did not answer");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const repo = normalise(value);
    if (!repo) return setMsg({ text: "needs owner/repository — e.g. owner/repo", tone: "error" });
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch("/api/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo }) });
      const body = (await r.json().catch(() => ({}))) as { job_id?: string; error?: string };
      if (body.job_id && (r.ok || r.status === 409)) {
        // 409 = a job is already running; the worker hands back its id — attach to it.
        setJobId(body.job_id);
        setValue("");
        setMsg(r.status === 409 ? { text: "an ingest is already running — attached to it", tone: "note" } : { text: `queued · job ${body.job_id.slice(0, 8)}`, tone: "note" });
      } else {
        setMsg({ text: body.error ?? `HTTP ${r.status}`, tone: "error" });
        toast.error("could not queue the repository", body.error ?? `HTTP ${r.status}`);
      }
    } catch {
      setMsg({ text: "live API unavailable", tone: "error" });
      toast.error("live API unavailable", "the worker on :8787 did not answer — start it with make up");
    } finally {
      setBusy(false);
    }
  }

  const invalid = msg?.tone === "error";
  const helper = disabled
    ? "adding needs the live worker API (make up) · offline: make add REPO=owner/repo"
    : "package-lock.json (v2/v3) or pnpm-lock.yaml (v6/v9) history is ingested · versions enriched from npm · OSV advisories linked · imports scanned at the latest commit";

  return (
    <>
      <form onSubmit={submit} noValidate className="elev rounded-xl border border-border bg-card p-[18px]">
        <label htmlFor="add-repo" className="label block">
          add repository
        </label>
        {prominent && <p className="mt-2.5 text-[12.5px] text-mut text-pretty">Watch a GitHub repository. Its lockfile history becomes the first service in the graph.</p>}
        {/* input + button as one control: shared border, the button sits inside the field */}
        <div className={cn("mt-3.5 flex overflow-hidden rounded-[9px] border bg-code transition-colors duration-200 ease-[var(--ease)]", invalid ? "border-l2/60" : "border-input focus-within:border-signal/45", (disabled || busy) && "opacity-60")}>
          <input
            id="add-repo"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (invalid) setMsg(null);
            }}
            placeholder="owner/repository"
            className="h-11 min-w-0 flex-1 bg-transparent px-[13px] font-mono text-[12.5px] text-fg outline-none placeholder:text-dim disabled:cursor-not-allowed"
            disabled={disabled || busy}
            aria-invalid={invalid || undefined}
            aria-describedby="add-repo-hint"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={disabled || busy}
            className="h-11 shrink-0 bg-signal px-[18px] text-[12px] font-medium leading-none text-ink transition-[filter,transform] duration-[180ms] ease-[var(--ease)] hover:brightness-[1.08] active:scale-[0.97] disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        <p id="add-repo-hint" aria-live="polite" className={cn("mt-[9px] font-mono text-[11px] leading-[1.5] text-pretty", invalid ? "text-l2" : msg ? "text-mut" : "text-dim")}>
          {msg?.text ?? helper}
        </p>
        {jobId && <JobCard key={jobId} id={jobId} onRetry={retry} busy={busy} />}
      </form>

      <div className="rounded-xl border border-border bg-card p-[18px]">
        <div className="flex items-baseline justify-between">
          <span className="label">recent jobs</span>
          <span className="num text-[11px] leading-none text-dim">{recent.length}</span>
        </div>
        <ul className="mt-3 flex flex-col">
          {recent.length === 0 && <li className="py-2.5 font-mono text-[11px] text-dim">{disabled ? "live API unavailable — no job history" : "no jobs yet"}</li>}
          {recent
            .filter((j) => j.job_id !== jobId)
            .map((j) => (
              <li key={j.job_id} className="flex min-h-10 items-center gap-3 border-b border-line py-1.5 last:border-b-0">
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[j.status] ?? "bg-l1")} />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-none text-mut" title={`job ${j.job_id}${j.error ? ` — ${j.error}` : ""}`}>
                  {j.repo}
                </span>
                <span suppressHydrationWarning className="num min-w-0 max-w-[50%] truncate text-[10.5px] leading-none text-dim" title={j.error ?? String(j.started_at ?? "")}>
                  {what(j)} · {ago(j.started_at)}
                </span>
                {(j.status === "failed" || j.status === "interrupted") && !disabled && <RetryButton onClick={() => retry(j.job_id)} disabled={busy} compact />}
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}

const what = (j: Job) => (j.status === "running" && j.step ? `step · ${j.step}` : j.status === "failed" && j.error ? `failed · ${j.error}` : j.status);
// Status dot: done → present-only green, failed → act-now red, interrupted → unknown grey, else amber (queued/running).
const DOT: Record<string, string> = { done: "bg-l0", failed: "bg-l2", interrupted: "bg-unknown" };
const SETTLED = new Set<Job["status"]>(["done", "failed", "interrupted"]);

// Ghost retry control (never filled: the Add button is the one filled orange on this page).
function RetryButton({ onClick, disabled, compact = false }: { onClick: () => void; disabled?: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border border-border font-mono text-signal-2 transition-colors duration-[180ms] ease-[var(--ease)] hover:border-signal/40 hover:text-signal active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
        compact ? "min-h-10 px-2 text-[10.5px]" : "min-h-10 px-3 text-[12px]",
      )}
    >
      <RotateCcw className={compact ? "size-3" : "size-3.5"} /> retry
    </button>
  );
}

// Polls /api/jobs/[id] every 1.5 s until the job settles.
function JobCard({ id, onRetry, busy }: { id: string; onRetry: (id: string) => void; busy: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    settled.current = false;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store" });
        const body = (await r.json().catch(() => ({}))) as Job & { error?: string };
        if (stop) return;
        if (!r.ok) setErr(body.error ?? `HTTP ${r.status}`);
        else {
          setErr(null);
          setJob(body);
          if (SETTLED.has(body.status) && !settled.current) {
            settled.current = true;
            if (body.status === "done") router.refresh();
            return;
          }
        }
      } catch {
        if (!stop) setErr("live API unavailable");
      }
      if (!stop) timer = setTimeout(tick, 1500);
    };
    let timer = setTimeout(tick, 0);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, router]);

  const status = job?.status ?? "queued";
  const steps = job?.steps ?? [];
  const total = steps.reduce((a, s) => a + (s.ms ?? 0), 0);
  // The settled line is built from what the worker reported — never a canned count.
  const line =
    status === "done"
      ? `settled · ${steps.length} steps · ${fmtMs(total)}`
      : status === "failed"
        ? `failed · ${fmtMs(total)}`
        : status === "interrupted"
          ? "interrupted"
          : status === "running" && job?.step
            ? `running · ${job.step}`
            : status;

  return (
    <div className="mt-3.5 animate-[en_.3s_var(--ease)_both] rounded-[10px] border border-border bg-card2 p-3.5" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-[12px] leading-none text-fg">{job?.repo ?? "…"}</span>
        <span className="num min-w-0 truncate text-[10.5px] leading-none text-dim" title={`job ${id}`}>
          <span className={cn(status === "failed" && "text-l2", status === "interrupted" && "text-unknown")}>{line}</span> · job {id.slice(0, 8)}
        </span>
      </div>
      {err && <p className="mt-2 font-mono text-[11px] text-l1">{err} — retrying</p>}
      <ol className="mt-3 flex flex-col gap-[9px]">
        {steps.map((s) => (
          <Step key={s.name} step={s} />
        ))}
        {!job && (
          <li className="flex items-center gap-2.5 font-mono text-[11.5px] leading-none text-mut">
            <span className="grid size-3.5 place-items-center">
              <span className="blip size-[7px] rounded-full bg-signal" />
            </span>
            waiting for the job to start
          </li>
        )}
      </ol>
      {job?.error && <p className={cn("mt-2.5 font-mono text-[11px] leading-[1.5] text-pretty", status === "interrupted" ? "text-mut" : "text-l2")}>{job.error}</p>}
      {(status === "failed" || status === "interrupted") && (
        <div className="mt-2.5 flex justify-end animate-[en_.3s_var(--ease)_both]">
          <RetryButton onClick={() => onRetry(id)} disabled={busy} />
        </div>
      )}
      {status === "done" && (
        <div className="mt-2.5 flex justify-end animate-[en_.3s_var(--ease)_both]">
          <Link href="/board" className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-[12px] text-signal-2 transition-colors duration-[180ms] hover:text-signal">
            view on board <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

// One step row: icon (14px box) · mono label · detail · ms · 64x3 progress bar. The icon swaps from
// a blipping --signal dot to a --l0 check with the pop keyframe (opacity + scale .25→1 + blur 4→0)
// the moment the step reports done; the bar fills --signal while running and settles --l0.
function Step({ step }: { step: JobStep }) {
  const st = step.status;
  const w = st === "done" || st === "failed" || st === "skipped" ? "w-full" : st === "running" ? "w-1/2" : "w-0";
  const bar = st === "done" ? "bg-l0" : st === "failed" ? "bg-l2" : st === "skipped" ? "bg-input" : "bg-signal";
  return (
    <li className="flex items-center gap-2.5">
      <span className="grid size-3.5 shrink-0 place-items-center" aria-hidden>
        {st === "done" ? (
          <Check key="done" className="size-[13px] animate-[pop_.25s_var(--ease)_both] text-l0" strokeWidth={2} />
        ) : st === "failed" ? (
          <X key="failed" className="size-[13px] animate-[pop_.25s_var(--ease)_both] text-l2" strokeWidth={2} />
        ) : (
          <span className={cn("size-[7px] rounded-full", st === "running" ? "blip bg-signal" : "bg-input")} />
        )}
      </span>
      <span className={cn("shrink-0 font-mono text-[11.5px] leading-none", st === "done" || st === "skipped" ? "text-mut" : "text-fg")}>{step.name}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-none text-dim">{step.detail ?? ""}</span>
      <span className="num shrink-0 text-[10.5px] leading-none text-dim">{st === "running" || step.ms == null ? "—" : fmtMs(step.ms)}</span>
      <span className="h-[3px] w-16 shrink-0 overflow-hidden rounded-[2px] bg-hover max-[900px]:hidden">
        <span className={cn("block h-full transition-[width] duration-300 ease-[var(--ease)]", w, bar)} />
      </span>
    </li>
  );
}

// Relative time for recent jobs ("4 min ago"); exact stamp lives in the title attribute.
function ago(v: string | number | null) {
  if (v == null) return "—";
  const d = typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
