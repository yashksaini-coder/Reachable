"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { ArrowUp, CornerDownRight, Loader2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describe, EXAMPLES, parseAsk, type Ask } from "@/lib/ask";
import { Answer, sentence, type AskData } from "./answers";
import { Chip, HydraCard, Limits } from "@/components/console/ui";
import { fmtMs } from "@/lib/format";

type Msg =
  | { id: number; q: string; state: "loading"; ask: Ask }
  | { id: number; q: string; state: "done"; ask: Ask; data: AskData }
  | { id: number; q: string; state: "error"; ask?: Ask; error: string };

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

export function Chat({ initialQ, healthy: initialHealthy }: { initialQ: string; healthy: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [healthy, setHealthy] = useState(initialHealthy);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const ran = useRef(false);
  const reduced = useReducedMotion();
  const spring = reduced ? { duration: 0 } : SPRING;
  const enter = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } };

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || !healthy) return;
    const id = ++seq.current;
    const parsed = parseAsk(q);
    setDraft("");
    box.current?.focus();
    window.history.replaceState(null, "", `/ask?q=${encodeURIComponent(q)}`);
    if ("error" in parsed) {
      setMsgs((m) => [...m, { id, q, state: "error", error: parsed.error }]);
      return;
    }
    setMsgs((m) => [...m, { id, q, state: "loading", ask: parsed }]);
    let next: Msg;
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) });
      const j = (await r.json()) as { ask?: Ask; data?: AskData; error?: string };
      if (r.status === 503) setHealthy(false);
      next = r.ok && j.data ? { id, q, state: "done", ask: parsed, data: j.data } : { id, q, state: "error", ask: parsed, error: j.error ?? `HTTP ${r.status}` };
    } catch {
      next = { id, q, state: "error", ask: parsed, error: "request failed" };
    }
    setMsgs((m) => m.map((x) => (x.id === id ? next : x)));
  }

  useEffect(() => {
    if (ran.current || !initialQ) return;
    ran.current = true;
    void send(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  const insert = (q: string, go = false) => {
    setDraft(q);
    box.current?.focus();
    if (go) void send(q);
  };

  const empty = msgs.length === 0;
  const pending = msgs.some((m) => m.state === "loading");
  const last = msgs[msgs.length - 1];
  const followUps = last?.state === "done" ? followUpsFor(last.ask, last.data) : [];

  // One tree for both states so the composer is the same element and `layout` can dock it.
  return (
    <div className={cn("flex min-h-[70dvh] flex-col", empty && "items-center justify-center py-8")}>
      {!healthy && <Banner />}

      {empty ? (
        <div className="mb-8 text-center">
          <h1 className="text-balance text-[28px] font-semibold tracking-tight md:text-[34px]">Ask the graph</h1>
          <p className="mt-2 text-pretty text-[14px] text-muted-foreground">
            Questions become traversals inside HydraDB. Every answer shows the statement it ran.
          </p>
        </div>
      ) : (
        <div aria-live="polite" aria-relevant="additions" className="mx-auto w-full max-w-3xl flex-1 space-y-6 pb-6">
          {msgs.map((m) => (
            <article key={m.id} className="space-y-2">
              <motion.div {...enter} transition={spring} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md border border-signal/25 bg-signal/10 px-4 py-2 text-[13.5px] text-foreground">{m.q}</div>
              </motion.div>
              <motion.div {...enter} transition={{ ...spring, delay: reduced ? 0 : 0.08 }} className={cn("rounded-2xl rounded-tl-md border border-border bg-card p-4 elev")}>
                {m.state === "loading" && (
                  <>
                    <div className="flex flex-wrap items-baseline gap-3">
                      <h2 className="text-balance text-[15px] font-medium">{describe(m.ask)}</h2>
                      <Chip>{m.ask.kind}</Chip>
                      <span className="text-[11px] text-muted-foreground">traversing…</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-16 w-full rounded-lg" />
                    </div>
                  </>
                )}
                {m.state === "error" && (
                  <div className="text-[13px]">
                    <Chip tone="mr-2 border-l2/40 text-l2">{m.ask ? "no answer" : "not understood"}</Chip>
                    <span className="text-muted-foreground">{m.error}</span>
                    {!m.ask && (
                      <p className="mt-2 text-pretty text-[12px] text-muted-foreground">
                        Try e.g. <code className="text-foreground">what pulls chalk into owner/repo</code> or a read-only <code>MATCH</code>.
                      </p>
                    )}
                  </div>
                )}
                {m.state === "done" && (
                  <>
                    <div className="flex flex-wrap items-baseline gap-3">
                      <h2 className="text-balance text-[15px] font-medium">{describe(m.ask)}</h2>
                      <Chip>{m.ask.kind}</Chip>
                      <span className="num text-[11px] text-muted-foreground">{fmtMs(m.data.total_ms ?? m.data.ms)}</span>
                    </div>
                    <p className="mt-2 text-pretty text-[13.5px] leading-relaxed">{sentence(m.ask, m.data)}</p>
                    <div className="mt-3">
                      <Answer ask={m.ask} data={m.data} />
                    </div>
                    <HydraCard title={describe(m.ask)} cypher={m.data.cypher ?? []} ms={m.data.ms ?? 0} rows={(m.data.rows ?? []).length} />
                    <Limits items={m.data.limitations ?? []} />
                  </>
                )}
              </motion.div>
            </article>
          ))}
          {followUps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-1" aria-label="Follow-up suggestions">
              {followUps.map((f, i) => (
                <motion.button
                  key={f}
                  {...enter}
                  transition={{ ...spring, delay: reduced ? 0 : 0.12 + i * 0.06 }}
                  type="button"
                  onClick={() => insert(f, true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:border-signal/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.96]"
                >
                  <CornerDownRight className="size-3" strokeWidth={1.75} /> {f}
                </motion.button>
              ))}
            </div>
          )}
          <div ref={end} />
        </div>
      )}

      <motion.div
        layout="position"
        transition={spring}
        className={cn("w-full", empty ? "max-w-2xl" : "sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 pt-3 pb-3 backdrop-blur md:-mx-6 md:px-6")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className={cn("mx-auto w-full", empty ? "max-w-2xl" : "max-w-3xl")}
        >
          <div
            className={cn(
              "flex items-end gap-2 rounded-2xl border border-border bg-card px-4 py-3 transition-[box-shadow,border-color] duration-150 focus-within:border-signal/50 focus-within:ring-4 focus-within:ring-signal/10",
              "elev",
              !healthy && "opacity-60",
            )}
          >
            <textarea
              ref={box}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={empty ? 2 : 1}
              disabled={!healthy}
              placeholder={healthy ? "Ask anything about your dependency graph" : "live API unavailable"}
              aria-label="Ask the graph"
              className="min-h-11 w-full resize-none bg-transparent text-base leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed md:text-[14.5px]"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!healthy || (!draft.trim() && !pending)}
              className="relative size-10 shrink-0 rounded-full transition-[background-color,transform] active:scale-[0.96]"
              aria-label={pending ? "Sending" : "Send"}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={pending ? "busy" : "send"}
                  initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                  transition={spring}
                  className="grid place-items-center"
                >
                  {pending ? <Loader2 className="animate-spin" strokeWidth={2.25} /> : <ArrowUp strokeWidth={2.25} />}
                </motion.span>
              </AnimatePresence>
            </Button>
          </div>
          <div className="mt-1.5 flex justify-between px-1 text-[11px] text-muted-foreground">
            <span>plain words or read-only Cypher</span>
            <span className="hidden md:inline">Enter sends · Shift+Enter newline</span>
          </div>
        </form>
      </motion.div>

      {empty && (
        <ul className="mx-auto mt-6 w-full max-w-2xl space-y-1" aria-label="Suggestions">
          {EXAMPLES.slice(0, 4).map((e, i) => (
            <li key={e.q}>
              <button
                type="button"
                disabled={!healthy}
                onClick={() => insert(e.q, true)}
                style={{ animationDelay: `${120 + i * 70}ms` }}
                className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.98] disabled:opacity-40 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500"
              >
                <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-signal" strokeWidth={1.75} />
                <span className="truncate">{e.q}</span>
                <span className="ml-auto hidden shrink-0 text-[11px] text-muted-foreground/70 md:inline">{e.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Banner() {
  return (
    <div role="status" className="mx-auto mb-6 flex w-full max-w-2xl items-start gap-3 rounded-lg border border-unknown/40 bg-card px-4 py-3 text-[13px] text-muted-foreground">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
        <PlugZap className="size-4 text-unknown" strokeWidth={1.75} />
      </span>
      <div className="text-pretty">
        <div className="font-medium text-foreground">Live API unavailable</div>
        Questions run inside HydraDB through the local worker (<code>make up</code>). Nothing here is served from cache — start the worker and reload.
      </div>
    </div>
  );
}

// Contextual follow-ups: cheap, deterministic, from the last answer's data.
function followUpsFor(ask: Ask, data: AskData): string[] {
  const rows = data.rows ?? [];
  const svc = (rows.find((r) => typeof r.service === "string")?.service as string | undefined)?.replace(/^svc:/, "");
  const out: string[] = [];
  switch (ask.kind) {
    case "exposed":
      out.push(`who resolved ${ask.advisory} while it was live`, `maintainers of ${ask.advisory}`);
      if (svc) out.push(`is ${svc} exposed to ${ask.advisory}`);
      break;
    case "depends":
      if (svc) out.push(`what pulls ${ask.package} into ${svc}`);
      out.push(`typosquats near ${ask.package}`);
      break;
    case "while-live":
      out.push(`who is exposed to ${ask.advisory}`, `which versions does ${ask.advisory} affect`);
      break;
    case "pulls":
      out.push(`typosquats near ${ask.package}`, `MATCH (p:Package)-[r:NAME_SIMILAR_TO]->(q:Package) RETURN p.key AS suspect, q.key AS popular, r.kind AS kind LIMIT 20`);
      break;
    case "versions":
    case "maintainers":
      out.push(`who is exposed to ${ask.advisory}`, `who resolved ${ask.advisory} while it was live`);
      break;
    default:
      break;
  }
  return out.slice(0, 3);
}
