"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, Loader2, Plus, X } from "lucide-react";
import type { Job, JobStep } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 2 : 0)} ms`);
const SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const normalise = (raw: string) => {
  const s = raw.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "").split("/").slice(0, 2).join("/");
  return SLUG.test(s) ? s : null;
};

export function AddRepository({ disabled, recent }: { disabled: boolean; recent: Job[] }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const repo = normalise(value);
    if (!repo) return setErr("expected owner/repo or https://github.com/owner/repo");
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo }) });
      const body = (await r.json().catch(() => ({}))) as { job_id?: string; error?: string };
      if (!r.ok || !body.job_id) setErr(body.error ?? `HTTP ${r.status}`);
      else {
        setJobId(body.job_id);
        setValue("");
      }
    } catch {
      setErr("live API unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <form onSubmit={submit} className="rounded-lg border border-border bg-card/70 p-4">
        <label htmlFor="add-repo" className="mb-2 block text-[13px] font-medium">
          Add a repository
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="add-repo"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="owner/repo or https://github.com/owner/repo"
            className="max-w-md font-mono"
            disabled={disabled || busy}
            aria-invalid={err ? true : undefined}
            aria-describedby="add-repo-hint"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={disabled || busy || !value.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </div>
        <p id="add-repo-hint" className={cn("mt-2 text-[12px]", err ? "text-l2" : "text-muted-foreground")}>
          {err ??
            (disabled
              ? "Adding requires the live worker API (make up). Offline, use make add REPO=owner/repo once it is back."
              : "Ingests every package-lock.json commit, enriches new versions from npm, pulls OSV advisories and scans imports at the latest commit — one traversal-ready service in the graph.")}
        </p>
      </form>

      {jobId && <JobCard id={jobId} />}

      {recent.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">recent jobs</div>
          <ul className="divide-y divide-border">
            {recent
              .filter((j) => j.job_id !== jobId)
              .map((j) => (
                <li key={j.job_id} className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3 py-1 text-[12.5px] sm:grid-cols-[minmax(0,1fr)_90px_120px_140px]">
                  <span className="truncate font-mono">{j.repo}</span>
                  <StatusChip status={j.status} />
                  <span className="hidden truncate text-muted-foreground sm:block">{j.status === "running" && j.step ? `step: ${j.step}` : ""}</span>
                  <span className="num text-right text-[11.5px] text-muted-foreground">{when(j.started_at)}</span>
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
  return (
    <div className="rounded-lg border border-border bg-card/70 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[13px]">{job?.repo ?? "…"}</span>
        <StatusChip status={status} />
        <span className="font-mono text-[10.5px] text-muted-foreground">job {id}</span>
        {status === "done" && (
          <Link href="/board" className="ml-auto text-[12.5px] text-signal-2 hover:underline">
            open the board →
          </Link>
        )}
      </div>
      {err && <p className="mt-2 text-[12px] text-l1">{err} — retrying</p>}
      <ol className="mt-3 space-y-1.5">
        {(job?.steps ?? []).map((s) => (
          <Step key={s.name} step={s} />
        ))}
        {!job && (
          <li className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> waiting for the job to start
          </li>
        )}
      </ol>
      {job?.error && <p className="mt-2 text-[12px] text-l2">{job.error}</p>}
    </div>
  );
}

function Step({ step }: { step: JobStep }) {
  const icon =
    step.status === "running" ? (
      <Loader2 className="size-3.5 animate-spin text-signal" />
    ) : step.status === "done" ? (
      <Check className="size-3.5 text-l0" strokeWidth={2.25} />
    ) : step.status === "failed" ? (
      <X className="size-3.5 text-l2" strokeWidth={2.25} />
    ) : (
      <Circle className="size-3.5 text-muted-foreground/60" strokeWidth={1.5} />
    );
  return (
    <li className="grid grid-cols-[16px_110px_minmax(0,1fr)_80px] items-center gap-x-2 text-[12.5px]">
      {icon}
      <span className={cn("font-mono", step.status === "pending" || step.status === "skipped" ? "text-muted-foreground" : "")}>{step.name}</span>
      <span className="truncate text-muted-foreground">{step.detail ?? ""}</span>
      <span className="num text-right text-[11.5px] text-muted-foreground">{step.ms != null ? fmtMs(step.ms) : ""}</span>
    </li>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "done" ? "border-l0/40 text-l0" : status === "failed" ? "border-l2/40 text-l2" : status === "running" ? "border-signal/40 text-signal-2" : "border-border text-muted-foreground";
  return <span className={cn("w-fit rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase", tone)}>{status}</span>;
}

function when(v: string | number | null) {
  if (v == null) return "—";
  const d = typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}
