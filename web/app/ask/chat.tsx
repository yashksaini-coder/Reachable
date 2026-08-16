"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describe, EXAMPLES, parseAsk, type Ask } from "@/lib/ask";
import { Answer, sentence, type AskData } from "./answers";
import { Chip, HydraCard, Limits } from "@/app/ui";
import { fmtMs } from "@/lib/format";

type Msg =
  | { id: number; q: string; state: "loading"; ask: Ask }
  | { id: number; q: string; state: "done"; ask: Ask; data: AskData }
  | { id: number; q: string; state: "error"; ask?: Ask; error: string };

export function Chat({ initialQ, healthy: initialHealthy }: { initialQ: string; healthy: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [healthy, setHealthy] = useState(initialHealthy);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const ran = useRef(false);

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

  const insert = (q: string) => {
    setDraft(q);
    box.current?.focus();
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <section className="flex min-h-[60dvh] flex-col">
        {!healthy && (
          <div role="status" className="mb-4 flex items-start gap-3 rounded-lg border border-unknown/40 bg-card px-4 py-3 text-[13px] text-muted-foreground">
            <PlugZap className="mt-0.5 size-4 shrink-0 text-unknown" strokeWidth={1.75} />
            <div>
              <div className="font-medium text-foreground">Live API unavailable</div>
              Questions run inside HydraDB through the local worker (<code>make up</code>). Nothing here is served from cache — start the worker and reload.
            </div>
          </div>
        )}

        <div aria-live="polite" aria-relevant="additions" className="flex-1 space-y-5">
          {msgs.length === 0 && healthy && (
            <p className="text-[13px] text-muted-foreground">
              Ask in plain words or paste a read-only Cypher statement. Every answer shows the statements HydraDB executed and how long they took.
            </p>
          )}
          {msgs.map((m) => (
            <article key={m.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 font-mono text-[13px] text-foreground">{m.q}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                {m.state === "loading" && (
                  <>
                    <div className="flex flex-wrap items-baseline gap-3">
                      <h2 className="text-[15px] font-medium">{describe(m.ask)}</h2>
                      <Chip>{m.ask.kind}</Chip>
                      <span className="text-[11px] text-muted-foreground">running in HydraDB…</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  </>
                )}
                {m.state === "error" && (
                  <div className="text-[13px]">
                    <Chip tone="mr-2 border-l2/40 text-l2">{m.ask ? "no answer" : "not understood"}</Chip>
                    <span className="text-muted-foreground">{m.error}</span>
                    {!m.ask && (
                      <p className="mt-2 text-[12px] text-muted-foreground">
                        Try one of the shapes on the right, e.g. <code className="text-foreground">what pulls chalk into owner/repo</code>.
                      </p>
                    )}
                  </div>
                )}
                {m.state === "done" && (
                  <>
                    <div className="flex flex-wrap items-baseline gap-3">
                      <h2 className="text-[15px] font-medium">{describe(m.ask)}</h2>
                      <Chip>{m.ask.kind}</Chip>
                      <span className="num text-[11px] text-muted-foreground">{fmtMs(m.data.total_ms ?? m.data.ms)}</span>
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed">{sentence(m.ask, m.data)}</p>
                    <div className="mt-3">
                      <Answer ask={m.ask} data={m.data} />
                    </div>
                    <HydraCard title={describe(m.ask)} cypher={m.data.cypher ?? []} ms={m.data.ms ?? 0} rows={(m.data.rows ?? []).length} />
                    <Limits items={m.data.limitations ?? []} />
                  </>
                )}
              </div>
            </article>
          ))}
          <div ref={end} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="sticky bottom-0 mt-6 space-y-2 border-t border-border bg-background/95 pt-3 pb-2 backdrop-blur"
        >
          <div className="flex items-end gap-2 rounded-lg border border-border bg-card px-3 py-2 focus-within:border-signal/60 focus-within:ring-2 focus-within:ring-signal/20">
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
              rows={2}
              disabled={!healthy}
              placeholder={healthy ? "Ask a question or paste read-only Cypher" : "live API unavailable"}
              aria-label="Ask the graph"
              className="min-h-11 w-full resize-none bg-transparent font-mono text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 md:text-[13px]"
            />
            <Button type="submit" disabled={!healthy || !draft.trim()} className="min-h-11 min-w-11" aria-label="Send">
              <CornerDownLeft strokeWidth={2} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 md:hidden" aria-label="Examples">
            {EXAMPLES.map((e) => (
              <button
                key={e.q}
                type="button"
                disabled={!healthy}
                onClick={() => insert(e.q)}
                className="min-h-11 rounded-full border border-border bg-card px-3 font-mono text-[11px] text-muted-foreground transition-colors hover:border-signal/50 hover:text-foreground disabled:opacity-50"
              >
                {e.q.length > 44 ? `${e.q.slice(0, 44)}…` : e.q}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Enter sends · Shift+Enter for a newline</p>
        </form>
      </section>

      <aside className="hidden md:block">
        <div className="sticky top-20">
          <div className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">What you can ask</div>
          <ul className="space-y-1">
            {EXAMPLES.map((e) => (
              <li key={e.q}>
                <button
                  type="button"
                  disabled={!healthy}
                  onClick={() => insert(e.q)}
                  className="w-full min-h-11 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-signal/50 disabled:opacity-50"
                >
                  <div className="truncate font-mono text-[12px] text-foreground">{e.q}</div>
                  <div className="text-[11px] text-muted-foreground">{e.hint}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
