"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Circle, Loader2, Plus, X } from "lucide-react";
import type { Job, JobStep } from "@/lib/api";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;
const SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const normalise = (raw: string) => {
  const s = raw.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "").split("/").slice(0, 2).join("/");
  return SLUG.test(s) ? s : null;
};

export function AddRepository({ disabled, recent, prominent = false }: { disabled: boolean; recent: Job[]; prominent?: boolean }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const repo = normalise(value);
    if (!repo) return setErr("expected owner/repo or https://github.com/owner/repo");
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo }) });
      const body = (await r.json().catch(() => ({}))) as { job_id?: string; error?: string };
      if (body.job_id && (r.ok || r.status === 409)) {
        // 409 = a job is already running; the worker hands back its id — attach to it.
        setJobId(body.job_id);
        setValue("");
        if (r.status === 409) setErr("an ingest is already running — attached to it");
      } else setErr(body.error ?? `HTTP ${r.status}`);
    } catch {
      setErr("live API unavailable");
    } finally {
      setBusy(false);
    }
  }

  const invalid = err != null && !err.startsWith("an ingest");
  return (
    <section className="space-y-3">
      <form onSubmit={submit} noValidate className={cn("elev rounded-xl border border-border bg-card p-4", prominent && "p-5")}>
        <div className="mb-3">
          <label htmlFor="add-repo" className="block text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            add repository
          </label>
          {prominent && <p className="mt-1 text-[13px] text-pretty">Watch a GitHub repository. Its lockfile history becomes a service in the graph.</p>}
        </div>
        {/* input + button as one control: shared border, the button sits inside the field */}
        <div
          className={cn(
            "flex h-10 max-w-xl overflow-hidden rounded-lg border bg-background/60 transition-[border-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-signal/50",
            invalid ? "border-l2/60" : "border-input focus-within:border-signal/60",
            (disabled || busy) && "opacity-60",
          )}
        >
          <input
            id="add-repo"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (invalid) setErr(null);
            }}
            placeholder="owner/repo or https://github.com/owner/repo"
            className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
            disabled={disabled || busy}
            aria-invalid={invalid || undefined}
            aria-describedby="add-repo-hint"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={disabled || busy || !value.trim()}
            className="flex min-w-[4.5rem] items-center justify-center gap-1.5 border-l border-border bg-signal px-3 text-[13px] font-medium text-background transition-[background-color,transform] duration-150 hover:bg-signal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal-2 active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <Swap k={busy ? "busy" : "idle"}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" strokeWidth={2.25} />}</Swap>
            Add
          </button>
        </div>
        <p id="add-repo-hint" aria-live="polite" className={cn("mt-2 max-w-xl text-[12px] text-pretty", invalid ? "text-l2" : err ? "text-l1" : "text-muted-foreground")}>
          {err ??
            (disabled
              ? "Adding requires the live worker API (make up). Offline, use make add REPO=owner/repo once it is back."
              : "Ingests every package-lock.json commit, enriches new versions from npm, pulls OSV advisories and scans imports at the latest commit — one traversal-ready service in the graph.")}
        </p>
      </form>

      <AnimatePresence>
        {jobId && (
          <motion.div key={jobId} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2, transition: { duration: 0.2 } }} transition={SPRING}>
            <JobCard id={jobId} />
          </motion.div>
        )}
      </AnimatePresence>

      {recent.length > 0 && (
        <div className="elev rounded-xl border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">recent jobs</span>
            <span className="num text-[11px] text-muted-foreground">{recent.length}</span>
          </div>
          <ul className="divide-y divide-border">
            {recent
              .filter((j) => j.job_id !== jobId)
              .map((j) => (
                <li
                  key={j.job_id}
                  className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3 py-1 text-[12.5px] transition-colors hover:bg-accent/40 sm:grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)_88px]"
                >
                  <span className="truncate font-mono">{j.repo}</span>
                  <StatusChip status={j.status} />
                  <span className="hidden truncate text-muted-foreground sm:block">{j.status === "running" && j.step ? `step · ${j.step}` : j.error ? j.error : ""}</span>
                  <span suppressHydrationWarning className="num text-right text-[11.5px] text-muted-foreground" title={String(j.started_at ?? "")}>
                    {ago(j.started_at)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Polls /api/jobs/[id] every 1.5 s until the job settles.
function JobCard({ id }: { id: string }) {
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
          if ((body.status === "done" || body.status === "failed") && !settled.current) {
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
  const finished = steps.filter((s) => s.status === "done" || s.status === "failed" || s.status === "skipped").length;
  const running = steps.some((s) => s.status === "running") ? 0.5 : 0;
  const progress = status === "done" ? 1 : steps.length ? (finished + running) / steps.length : 0;
  const total = steps.reduce((a, s) => a + (s.ms ?? 0), 0);

  return (
    <div className="elev relative overflow-hidden rounded-xl border border-border bg-card p-4" aria-live="polite">
      {/* thin progress bar across the top; width tracks steps, spring, no bounce */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-border/60" aria-hidden>
        <motion.div
          className={cn("h-full", status === "failed" ? "bg-l2" : status === "done" ? "bg-l0" : "bg-signal")}
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[13px]">{job?.repo ?? "…"}</span>
        <StatusChip status={status} />
        <span className="num text-[10.5px] text-muted-foreground">job {id}</span>
        {total > 0 && <span className="num text-[11px] text-muted-foreground">{fmtMs(total)}</span>}
        <AnimatePresence>
          {status === "done" && (
            <motion.span key="board" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="ml-auto">
              <Link
                href="/board"
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-signal-2 transition-colors hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
              >
                view on board <ArrowRight className="size-3.5" strokeWidth={2} />
              </Link>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {err && <p className="mt-2 text-[12px] text-l1">{err} — retrying</p>}
      <ol className="mt-3 space-y-1">
        {steps.map((s) => (
          <Step key={s.name} step={s} />
        ))}
        {!job && (
          <li className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> waiting for the job to start
          </li>
        )}
      </ol>
      {job?.error && <p className="mt-2 text-[12px] text-l2 text-pretty">{job.error}</p>}
    </div>
  );
}

// Icon cross-fade: opacity + scale(0.25→1) + blur(4px→0), spring 0.3, bounce 0.
function Swap({ k, children }: { k: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative grid size-4 place-items-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={k}
          className="grid place-items-center"
          initial={reduce ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={reduce ? undefined : { opacity: 0, scale: 0.25, filter: "blur(4px)", transition: { duration: 0.2 } }}
          transition={SPRING}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Step({ step }: { step: JobStep }) {
  const active = step.status === "running";
  const icon =
    step.status === "running" ? (
      <Loader2 className="size-3.5 animate-spin text-signal" />
    ) : step.status === "done" ? (
      <Check className="size-3.5 text-l0" strokeWidth={2.25} />
    ) : step.status === "failed" ? (
      <X className="size-3.5 text-l2" strokeWidth={2.25} />
    ) : (
      <Circle className="size-3.5 text-muted-foreground/50" strokeWidth={1.5} />
    );
  return (
    <li className={cn("grid min-h-7 grid-cols-[16px_110px_minmax(0,1fr)_80px] items-center gap-x-2 rounded-md px-1 text-[12.5px] transition-colors", active && "bg-signal/5")}>
      <Swap k={step.status}>{icon}</Swap>
      <span className={cn("font-mono transition-colors", step.status === "pending" || step.status === "skipped" ? "text-muted-foreground" : "")}>{step.name}</span>
      <span className="truncate text-muted-foreground">{step.detail ?? ""}</span>
      <span className="num text-right text-[11.5px] text-muted-foreground">{step.ms != null ? fmtMs(step.ms) : ""}</span>
    </li>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "done" ? "border-l0/40 text-l0" : status === "failed" ? "border-l2/40 text-l2" : status === "running" ? "border-signal/40 text-signal-2" : "border-border text-muted-foreground";
  return <span className={cn("w-fit rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase transition-colors", tone)}>{status}</span>;
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
