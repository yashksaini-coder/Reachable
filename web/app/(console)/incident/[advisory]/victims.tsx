"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, Loader2, Search } from "lucide-react";
import { short } from "@/lib/format";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

type Victim = { repo: string; url: string; path: string; versions: string[]; watched: boolean };
type Resp = { rows?: Victim[]; searched?: string[]; errors?: string[]; limitations?: string[]; error?: string };

// Beyond the watched set: ask GitHub which public repos pin an affected tarball today, then watch
// them with one click. Nothing here is a verdict — watching a repo is what produces one.
export function FindVictims({ advisory }: { advisory: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [data, setData] = useState<Resp | null>(null);
  const [rows, setRows] = useState<Victim[]>([]);
  const reduce = useReducedMotion();

  async function search() {
    setState("busy");
    try {
      const r = await fetch(`/api/victims?advisory=${encodeURIComponent(advisory)}`);
      const body = (await r.json().catch(() => ({}))) as Resp;
      setData(r.ok ? body : { error: body.error ?? `HTTP ${r.status}` });
      setRows(r.ok ? (body.rows ?? []) : []);
    } catch {
      setData({ error: "live API unavailable" });
    } finally {
      setState("done");
    }
  }

  const unwatched = rows.filter((v) => !v.watched).length;
  return (
    <section className="elev overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] tracking-widest text-signal">+</span>
        <h2 className="text-balance text-[17px] font-medium tracking-tight">Beyond the watched set</h2>
        <span className="text-[11px] text-muted-foreground">public repos on GitHub that pin an affected version today</span>
        {state === "done" && data && !data.error && (
          <span className="num basis-full text-[11px] text-muted-foreground md:ml-auto md:basis-auto md:text-right">
            {rows.length} repos · {unwatched} not watched
          </span>
        )}
      </header>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={search}
            disabled={state === "busy"}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-[13px] transition-[background-color,border-color,transform] duration-150 hover:border-signal/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {state === "idle" ? "Search GitHub for exposed public repos" : state === "busy" ? "searching lockfiles…" : "search again"}
          </button>
          <p className="text-[12px] text-muted-foreground text-pretty">
            {state === "busy"
              ? "GitHub code search takes about ten seconds."
              : "Code search on the exact tarball name in package-lock.json. Watching a repo runs the real ingest and puts it on the timeline above."}
          </p>
        </div>

        <AnimatePresence initial={false}>
          {state === "done" && data && (
            <motion.div key="res" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2, transition: { duration: 0.2 } }} transition={SPRING} className="mt-4">
              {data.error ? (
                <p className="rounded-lg border border-border bg-background/40 px-3 py-2 text-[12.5px] text-l1">{data.error}</p>
              ) : rows.length === 0 ? (
                <p className="rounded-lg border border-border bg-background/40 px-3 py-2 text-[12.5px] text-muted-foreground">
                  No public lockfile pins {data.searched?.map((s) => s.split(" ")[0]).join(", ")}.{data.errors?.length ? ` (${data.errors[0]})` : ""}
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {rows.map((v) => (
                    <VictimRow key={v.repo} v={v} onWatched={() => setRows((rs) => rs.map((x) => (x.repo === v.repo ? { ...x, watched: true } : x)))} />
                  ))}
                </ul>
              )}
              {data.limitations?.map((l) => (
                <p key={l} className="mt-2 text-[11px] text-muted-foreground text-pretty">{l}</p>
              ))}
              {data.errors && data.errors.length > 0 && rows.length > 0 && <p className="mt-1 text-[11px] text-l1">{data.errors.length} of {data.searched?.length} searches failed — results are partial.</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function VictimRow({ v, onWatched }: { v: Victim; onWatched: () => void }) {
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function watch() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo: v.repo }) });
      const body = (await r.json().catch(() => ({}))) as { job_id?: string; error?: string };
      if (body.job_id && (r.ok || r.status === 409)) {
        setJobId(body.job_id);
        onWatched();
      } else setErr(body.error ?? `HTTP ${r.status}`);
    } catch {
      setErr("live API unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1.5 text-[12.5px] transition-colors hover:bg-accent/40 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <a href={v.url} target="_blank" rel="noreferrer" className="group inline-flex min-w-0 items-center gap-1 font-mono hover:text-signal-2">
        <span className="truncate">{v.repo}</span>
        <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
      <span className="hidden truncate font-mono text-[11.5px] text-muted-foreground sm:block">{v.versions.map(short).join(", ")}</span>
      <span className="justify-self-end">
        {jobId ? (
          <Link href="/services" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11.5px] text-l0 hover:underline">
            <Check className="size-3" /> ingesting · jobs
          </Link>
        ) : v.watched ? (
          <span className="inline-flex h-8 items-center gap-1 px-2 text-[11.5px] text-muted-foreground">
            <Check className="size-3" /> watched
          </span>
        ) : (
          <button
            type="button"
            onClick={watch}
            disabled={busy}
            title={err ?? undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[11.5px] transition-[background-color,border-color,transform] duration-150 hover:border-signal/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.96] disabled:opacity-60",
              err && "border-l2/60 text-l2",
            )}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : null}
            {err ? "failed · retry" : "watch"}
          </button>
        )}
      </span>
    </li>
  );
}
