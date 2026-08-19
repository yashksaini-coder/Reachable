"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Radio, RotateCcw, X } from "lucide-react";
import type { Job, JobStep } from "@/lib/api";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/console/toast";
import { StateView } from "@/components/console/states";

const SLUG = /^[\w.-]+\/[\w.-]+$/;
const normalise = (raw: string) => {
  const s = raw.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "").split("/").slice(0, 2).join("/");
  return SLUG.test(s) ? s : null;
};

const RECENT_MAX = 8;
// Both cards share ONE fixed height at ≥900px so the top row never jumps, whatever the data:
// 420px, flex columns; the job region on the left always renders (placeholder or JobCard, filling
// the slot, steps scroll inside), and the recent list scrolls inside its card. Below 900px the
// cards stack and take natural height; the recent list is capped at 336px and scrolls.
// Header pattern: `.label` left + mono meta right, 1px --line beneath, 18px padding.
// 480px: header + input + helper + a JobCard with all four steps visible (no inner scroll) + error line + footer link.
const CARD = "elev flex flex-col overflow-hidden rounded-xl border border-border bg-card min-[900px]:h-[480px]";
const HEAD = "flex h-12 shrink-0 items-center justify-between border-b border-line px-[18px]";
const BODY = "flex min-h-0 flex-1 flex-col p-[18px]";

// Renders the two cells of the /services top row: the add-repository card (with the running
// JobCard beneath it) and the recent-jobs card. The page owns the grid; `recent` is newest first.
export function AddRepository({ disabled, recent, prominent = false }: { disabled: boolean; recent: Job[]; prominent?: boolean }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  // Queue or retry; 409 = a job is already running and the worker hands back its id — attach to it.
  async function post(url: string, body: BodyInit | undefined, failTitle: string) {
    setBusy(true);
    try {
      const r = await fetch(url, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body });
      const res = (await r.json().catch(() => ({}))) as { job_id?: string; error?: string };
      if (res.job_id && (r.ok || r.status === 409)) {
        setJobId(res.job_id);
        setErr(null);
        if (r.status === 409) toast.note("an ingest is already running", "attached to it");
        return true;
      }
      setErr(res.error ?? `HTTP ${r.status}`);
      toast.error(failTitle, res.error ?? `HTTP ${r.status}`);
    } catch {
      setErr("live API unavailable");
      toast.error("live data unavailable", "the graph did not answer — try again in a moment");
    } finally {
      setBusy(false);
    }
    return false;
  }
  const retry = async (id: string) => {
    const ok = await post(`/api/jobs/${encodeURIComponent(id)}/retry`, undefined, "could not retry the job");
    if (ok) toast.done("retry queued", "the ingest re-runs from the start; it is idempotent");
    return ok;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const repo = normalise(value);
    if (!repo) return setErr("needs owner/repository — e.g. owner/repo");
    if (await post("/api/services", JSON.stringify({ repo }), "could not queue the repository")) {
      toast.done(`watching ${repo}`, "reading its lockfile history — progress is in the job card");
      setValue("");
    }
  }

  const invalid = err != null;
  const helper = disabled
    ? "watching a repository needs the live graph, which is not reachable right now"
    : "npm (package-lock v2/v3) and pnpm (v6/v9) lockfile history · versions from npm · advisories from OSV · imports scanned at the latest commit";
  const shown = recent.slice(0, RECENT_MAX);

  return (
    <>
      <form onSubmit={submit} noValidate className={CARD}>
        <div className={HEAD}>
          <label htmlFor="add-repo" className="label">
            add repository
          </label>
        </div>
        <div className={BODY}>
          {prominent && <p className="mb-3.5 text-[13.5px] text-mut text-pretty">Watch a GitHub repository. Its lockfile history becomes the first service in the graph.</p>}
          {/* input + button as one control: shared border, the button sits inside the field */}
          <div className={cn("flex overflow-hidden rounded-[9px] border bg-code transition-colors duration-200 ease-[var(--ease)]", invalid ? "border-l2/60" : "border-input focus-within:border-signal/45", (disabled || busy) && "opacity-60")}>
            <input
              id="add-repo"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (invalid) setErr(null);
              }}
              placeholder="owner/repository"
              className="h-11 min-w-0 flex-1 bg-transparent px-[13px] font-mono text-[13.5px] text-fg outline-none placeholder:text-dim disabled:cursor-not-allowed"
              disabled={disabled || busy}
              aria-invalid={invalid || undefined}
              aria-describedby="add-repo-hint"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={disabled || busy}
              className="h-11 shrink-0 bg-signal px-[18px] text-[13px] font-medium leading-none text-ink transition-[filter,transform] duration-[180ms] ease-[var(--ease)] hover:brightness-[1.08] active:scale-[0.97] disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          {/* helper: validation / API errors or the default hint — queued/running state lives in the JobCard */}
          <p id="add-repo-hint" aria-live="polite" className={cn("mt-[9px] font-mono text-[12px] leading-[1.5] text-pretty", invalid ? "text-l2" : "text-dim")}>
            {err ?? helper}
          </p>
          {jobId ? (
            <JobCard key={jobId} id={jobId} onRetry={retry} busy={busy} />
          ) : (
            <StateView
              icon={Radio}
              sentence="no job running"
              hint="add a repository above — its lockfile history becomes a service"
              className="mt-3.5 min-h-[160px] flex-1 rounded-[10px] border border-dashed border-input p-4"
            />
          )}
        </div>
      </form>

      <div className={CARD}>
        <div className={HEAD}>
          <span className="label">recent jobs</span>
          <span className="num text-[12px] leading-none text-dim">{recent.length > shown.length ? `showing ${shown.length} of ${recent.length}` : recent.length}</span>
        </div>
        {shown.length === 0 ? (
          <StateView icon={Radio} sentence={disabled ? "live API unavailable — no job history" : "no jobs yet"} className="min-h-[160px] flex-1 p-4" />
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[18px] max-[900px]:max-h-[336px]">
            {shown.map((j) => (
              <li key={j.job_id} className="grid h-10 shrink-0 grid-cols-[6px_minmax(0,1fr)_minmax(0,auto)_76px] items-center gap-3 border-b border-line last:border-b-0">
                <span aria-hidden className={cn("size-1.5 rounded-full", DOT[j.status] ?? "bg-l1")} />
                <span className="min-w-0 truncate font-mono text-[13px] leading-none text-mut" title={j.repo}>
                  {j.repo}
                </span>
                <span suppressHydrationWarning className="num min-w-0 truncate whitespace-nowrap text-[11.5px] leading-none text-dim" title={`job ${j.job_id}${j.error ? ` — ${j.error}` : ""} · ${j.started_at ?? ""}`}>
                  {what(j)} · {ago(j.started_at)}
                </span>
                <span className="flex justify-end">{(j.status === "failed" || j.status === "interrupted") && !disabled && <RetryButton onClick={() => retry(j.job_id)} disabled={busy} compact />}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// Status word only; the error sentence lives in the row's title.
const what = (j: Job) => (j.status === "running" && j.step ? `running · ${j.step}` : j.status);
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
        compact ? "min-h-10 px-2 text-[11.5px]" : "min-h-10 px-3 text-[13px]",
      )}
    >
      <RotateCcw className={compact ? "size-3" : "size-3.5"} /> retry
    </button>
  );
}

// Polls /api/jobs/[id] every 1.5 s until the job settles. Bounded: header · steps (max 4 rows
// visible, scrolls beyond) · error clamped to two lines · footer link only when done.
function JobCard({ id, onRetry, busy }: { id: string; onRetry: (id: string) => void; busy: boolean }) {
  const router = useRouter();
  const toast = useToast();
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
            // An ingest runs for minutes; nobody watches the card throughout.
            const repo = body.repo ?? "the repository";
            if (body.status === "done") {
              const lockfiles = body.steps?.find((st) => st.name === "lockfiles")?.detail ?? null;
              toast.done(`${repo} is now watched`, lockfiles ?? "its lockfile history is in the graph");
              router.refresh();
            } else if (body.status === "interrupted") {
              toast.warn(`${repo} did not finish`, "the worker restarted mid-ingest — retry re-runs it idempotently");
            } else {
              toast.error(`${repo} failed to ingest`, body.error ?? "see the job card for the failing step");
            }
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
  }, [id, router, toast]);

  const status = job?.status ?? "queued";
  const steps = job?.steps ?? [];
  const measured = steps.some((s) => s.ms != null);
  const total = measured ? steps.reduce((a, s) => a + (s.ms ?? 0), 0) : null;
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
  const canRetry = status === "failed" || status === "interrupted";

  return (
    <div className="mt-3.5 flex min-h-0 flex-1 flex-col animate-[en_.3s_var(--ease)_both] rounded-[10px] border border-border bg-card2 p-3.5" aria-live="polite">
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[40%] flex-1 truncate font-mono text-[13px] leading-none text-fg max-[760px]:basis-full" title={job?.repo}>
          {job?.repo ?? "…"}
        </span>
        <span className="num min-w-0 truncate text-[11.5px] leading-none text-dim" title={`job ${id}`}>
          <span className={cn(status === "failed" && "text-l2", status === "interrupted" && "text-unknown")}>{line}</span> · job {id.slice(0, 8)}
        </span>
        {canRetry && <RetryButton onClick={() => onRetry(id)} disabled={busy} compact />}
      </div>
      {err && <p className="mt-2 font-mono text-[12px] text-l1">{err} — retrying</p>}
      <ol className="mt-2 flex-1">
        {steps.map((s) => (
          <Step key={s.name} step={s} />
        ))}
        {steps.length === 0 && (
          <li className="flex h-8 items-center gap-2.5 font-mono text-[12.5px] leading-none text-mut">
            <span className="grid size-3.5 place-items-center">
              <span className={cn("size-[7px] rounded-full", job && SETTLED.has(status) ? "bg-input" : "blip bg-signal")} />
            </span>
            {job && SETTLED.has(status) ? "no steps recorded" : "waiting for the job to start"}
          </li>
        )}
      </ol>
      {job?.error && (
        <p className={cn("mt-2 line-clamp-2 font-mono text-[12px] leading-[1.5]", status === "interrupted" ? "text-mut" : "text-l2")} title={job.error}>
          {job.error}
        </p>
      )}
      {status === "done" && (
        <div className="mt-auto flex justify-end pt-2 animate-[en_.3s_var(--ease)_both]">
          <Link href="/board" className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-[13px] text-signal-2 transition-colors duration-[180ms] hover:text-signal">
            view on board <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

// One step row (fixed h-8): icon (14px box) · mono label · detail · ms · 64x3 progress bar. The icon
// swaps from a blipping --signal dot to a --l0 check with the pop keyframe the moment the step
// reports done; the bar fills --signal while running and settles --l0.
function Step({ step }: { step: JobStep }) {
  const st = step.status;
  const w = st === "done" || st === "failed" || st === "skipped" ? "w-full" : st === "running" ? "w-1/2" : "w-0";
  const bar = st === "done" ? "bg-l0" : st === "failed" ? "bg-l2" : st === "skipped" ? "bg-input" : "bg-signal";
  return (
    <li className="flex h-8 shrink-0 items-center gap-2.5">
      <span className="grid size-3.5 shrink-0 place-items-center" aria-hidden>
        {st === "done" ? (
          <Check key="done" className="size-[13px] animate-[pop_.25s_var(--ease)_both] text-l0" strokeWidth={2} />
        ) : st === "failed" ? (
          <X key="failed" className="size-[13px] animate-[pop_.25s_var(--ease)_both] text-l2" strokeWidth={2} />
        ) : (
          <span className={cn("size-[7px] rounded-full", st === "running" ? "blip bg-signal" : "bg-input")} />
        )}
      </span>
      <span className={cn("shrink-0 font-mono text-[12.5px] leading-none", st === "done" || st === "skipped" ? "text-mut" : "text-fg")}>{step.name}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-none text-dim" title={step.detail ?? undefined}>
        {step.detail ?? ""}
      </span>
      <span className="num shrink-0 text-[11.5px] leading-none text-dim">{st === "running" || step.ms == null ? "—" : fmtMs(step.ms)}</span>
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
