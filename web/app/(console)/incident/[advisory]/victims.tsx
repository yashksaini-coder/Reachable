"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, Loader2, SearchX, Unplug } from "lucide-react";
import { short } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/console/toast";
import { EmptySlot } from "@/components/console/states";

const EASE = [0.32, 0.72, 0, 1] as const;

type Victim = { repo: string; url: string; path: string; versions: string[]; watched: boolean };
type Resp = { rows?: Victim[]; searched?: string[]; errors?: string[]; limitations?: string[]; error?: string };

// Beyond the watched set: ask GitHub which public repos pin an affected tarball today, then watch
// them with one click. Nothing here is a verdict — watching a repo is what produces one.
export function FindVictims({ advisory }: { advisory: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const toast = useToast();
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
      toast.error("live API unavailable", "GitHub search runs through the local worker — start it with make up");
    } finally {
      setState("done");
    }
  }

  const unwatched = rows.filter((v) => !v.watched).length;
  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-3 px-[18px] py-4">
        <div className="min-w-0">
          <h2 className="text-[18px] font-medium leading-[1.3] tracking-[-0.01em] text-fg">Beyond the watched set</h2>
          <div className="mt-[5px] font-mono text-[12px] leading-[1.4] text-dim">
            {state === "busy"
              ? "GitHub code search takes about ten seconds…"
              : state === "done" && data && !data.error
                ? `${rows.length} public repositories pin an affected version today · ${unwatched} not watched`
                : "public repositories on GitHub that pin an affected version today, not yet scanned by Reachable"}
          </div>
        </div>
        <button
          type="button"
          onClick={search}
          disabled={state === "busy"}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[7px] border border-border px-3.5 text-[13px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "busy" && <Loader2 className="size-3.5 animate-spin" />}
          {state === "idle" ? "search GitHub" : state === "busy" ? "searching lockfiles" : "search again"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {state === "done" && data && (
          <motion.div
            key="res"
            initial={reduce ? false : { opacity: 0.55, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0.55, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }}
            transition={{ duration: reduce ? 0 : 0.25, ease: EASE }}
            className="border-t border-line"
          >
            {data.error ? (
              <EmptySlot icon={Unplug}>{data.error}</EmptySlot>
            ) : rows.length === 0 ? (
              <EmptySlot icon={SearchX}>
                no public lockfile pins {data.searched?.map((s) => s.split(" ")[0]).join(", ")}
                {data.errors?.length ? ` · ${data.errors[0]}` : ""}
              </EmptySlot>
            ) : (
              <ul>
                {rows.map((v) => (
                  <VictimRow key={v.repo} v={v} onWatched={() => setRows((rs) => rs.map((x) => (x.repo === v.repo ? { ...x, watched: true } : x)))} />
                ))}
              </ul>
            )}
            {(data.limitations?.length || (data.errors?.length && rows.length > 0)) ? (
              <div className="space-y-1 px-[18px] py-3 font-mono text-[12px] leading-[1.6] text-dim">
                {data.limitations?.map((l) => (
                  <p key={l} className="text-pretty">
                    {l}
                  </p>
                ))}
                {data.errors && data.errors.length > 0 && rows.length > 0 && (
                  <p className="text-l1">
                    {data.errors.length} of {data.searched?.length} searches failed — results are partial.
                  </p>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function VictimRow({ v, onWatched }: { v: Victim; onWatched: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
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
      toast.error("could not start watching", "the worker did not answer");
    } finally {
      setBusy(false);
    }
  }

  const watched = jobId != null || v.watched;
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line px-[18px] py-3 last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={v.url} target="_blank" rel="noreferrer" className="group inline-flex min-w-0 items-center gap-1 font-mono text-[13px] leading-none text-mut hover:text-signal-2">
          <span className="truncate">{v.repo}</span>
          <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100" />
        </a>
        <span className="hidden max-w-[22ch] truncate font-mono text-[12px] text-dim sm:block">{v.versions.map(short).join(", ")}</span>
      </div>
      {watched ? (
        jobId ? (
          <Link href="/services" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-[7px] border border-l0/35 px-3 text-[12px] font-medium leading-none text-l0 hover:text-l0">
            <Check className="size-3" /> watched · ingesting
          </Link>
        ) : (
          <span className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-[7px] border border-l0/35 px-3 text-[12px] font-medium leading-none text-l0">
            <Check className="size-3" /> watched
          </span>
        )
      ) : (
        <button
          type="button"
          onClick={watch}
          disabled={busy}
          title={err ?? undefined}
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-[7px] border border-border px-3 text-[12px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97] disabled:opacity-50",
            err && "border-l2/60 text-l2",
          )}
        >
          {busy && <Loader2 className="size-3 animate-spin" />}
          {err ? "failed · retry" : "watch"}
        </button>
      )}
    </li>
  );
}
