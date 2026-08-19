"use client";

import Image from "next/image";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/console/toast";
import { ArrowRight, CornerDownRight, PlugZap } from "lucide-react";
import { describe, EXAMPLES, parseAsk, type Ask } from "@/lib/ask";
import { Answer, sentence, type AskData } from "./answers";
import { Chip, HydraCard, Limits } from "@/components/console/ui";

type Msg =
  | { id: number; q: string; state: "loading"; ask: Ask }
  | { id: number; q: string; state: "done"; ask: Ask; data: AskData }
  | { id: number; q: string; state: "error"; ask?: Ask; error: string };

const EN = "animate-[en_.3s_var(--ease)_both]";

export function Chat({ initialQ, healthy: initialHealthy }: { initialQ: string; healthy: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [healthy, setHealthy] = useState(initialHealthy);
  const toast = useToast();
  const box = useRef<HTMLInputElement>(null);
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
      toast.error("the question could not reach the graph", "no answer was received — ask again in a moment");
    }
    setMsgs((m) => m.map((x) => (x.id === id ? next : x)));
  }

  useEffect(() => {
    if (ran.current || !initialQ) return;
    ran.current = true;
    void send(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  // <main id="console-main"> is the scroll container — scroll it by offset, never the window.
  useEffect(() => {
    const main = document.getElementById("console-main");
    if (main && msgs.length) main.scrollTop = main.scrollHeight;
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

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[760px] flex-col px-10 pb-24 pt-16 max-[900px]:px-5">
      {!healthy && <Banner />}

      {empty ? (
        <div className={cn(EN, "flex flex-1 flex-col items-center justify-center py-6 text-center")}>
          {/* cold state only: the thesis image (inert stack, one traced route) — never next to data */}
          <Image src="/art/reachable-path-512.png" alt="" width={256} height={256} className="pixel mb-2 h-auto w-[192px] opacity-90 min-[600px]:w-[256px]" unoptimized />
          <h1 className="text-balance text-[24px] font-medium leading-[1.25] tracking-[-0.015em] text-fg">Ask the graph.</h1>
          <p className="mt-2.5 max-w-[44ch] text-pretty text-[14px] text-mut">One sentence back, then the rows it came from.</p>
        </div>
      ) : (
        <div aria-live="polite" aria-relevant="additions" className="flex flex-col gap-[22px]">
          {msgs.map((m) => (
            <article key={m.id} className="flex min-w-0 flex-col gap-[22px]">
              <div className={EN}>
                <div className="mb-2.5 font-mono text-[13px] leading-none text-dim">you asked</div>
                <div className="text-[15px] text-fg">{m.q}</div>
              </div>
              <div className={cn(EN, "[animation-delay:80ms]")}>
                {m.state === "loading" && (
                  <div className="flex items-center gap-2.5 text-[15px] leading-[1.6] text-mut">
                    <span className="blip size-[7px] rounded-full bg-signal" aria-hidden />
                    traversing · {describe(m.ask)}
                  </div>
                )}
                {m.state === "error" && (
                  <div className="text-[14px] text-mut">
                    <Chip tone="mr-2 text-l2">{m.ask ? "no answer" : "not understood"}</Chip>
                    {m.error}
                    {!m.ask && (
                      <p className="mt-2.5 text-[13px] text-dim text-pretty">
                        Try e.g. <code className="text-signal-2">what pulls chalk into owner/repo</code> or a read-only <code className="text-signal-2">MATCH</code>.
                      </p>
                    )}
                  </div>
                )}
                {m.state === "done" && (
                  <>
                    <p className="max-w-[64ch] text-[15px] leading-[1.6] text-fg text-pretty">{sentence(m.ask, m.data)}</p>
                    <div className="mt-3.5">
                      <Answer ask={m.ask} data={m.data} />
                    </div>
                    <div className="mt-2.5">
                      <HydraCard flat title={describe(m.ask)} cypher={m.data.cypher ?? []} ms={m.data.ms ?? 0} rows={(m.data.rows ?? []).length} />
                    </div>
                    <Limits items={m.data.limitations ?? []} />
                  </>
                )}
              </div>
            </article>
          ))}
          {followUps.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Follow-up suggestions">
              {followUps.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insert(f, true)}
                  style={{ animationDelay: `${120 + i * 60}ms` }}
                  className={cn(EN, "inline-flex min-h-10 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-mut transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg active:scale-[0.97]")}
                  title={f}
                >
                  <CornerDownRight className="size-3 shrink-0" /> <span className="truncate">{f}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={cn("min-h-7", !empty && "flex-1")} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className={cn("elev rounded-xl border border-border bg-card transition-colors duration-200 ease-[var(--ease)] focus-within:border-signal/45", !healthy && "opacity-60")}
      >
        <div className="flex items-center gap-3 py-1.5 pl-3.5 pr-1.5">
          <input
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!healthy}
            placeholder={healthy ? EXAMPLES[1].q : "live API unavailable"}
            aria-label="Ask the graph"
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-dim disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!healthy}
            aria-label={pending ? "Sending" : "Send"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border transition-[background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover active:scale-[0.96] disabled:cursor-not-allowed"
          >
            {pending ? (
              <span key="busy" className="blip size-[7px] rounded-full bg-signal animate-[pop_.25s_var(--ease)_both]" aria-hidden />
            ) : (
              <ArrowRight key="send" className="size-[15px] text-signal animate-[pop_.25s_var(--ease)_both]" />
            )}
          </button>
        </div>
      </form>

      {empty && (
        <ul className="mt-3.5 flex flex-col gap-0.5" aria-label="Suggestions">
          {EXAMPLES.slice(0, 5).map((e, i) => (
            <li key={e.q}>
              <button
                type="button"
                disabled={!healthy}
                onClick={() => insert(e.q, true)}
                style={{ animationDelay: `${120 + i * 60}ms` }}
                className={cn(EN, "flex min-h-10 w-full flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-lg px-3 py-[9px] text-left transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover active:scale-[0.98] disabled:opacity-40")}
              >
                <span className="min-w-0 text-[13.5px] leading-[1.4] text-mut">{e.q}</span>
                <span className="min-w-0 font-mono text-[12px] leading-[1.4] text-dim">{e.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Degraded state: dashed --input border, muted icon circle, one mono sentence.
function Banner() {
  return (
    <div role="status" className="mb-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-input px-[18px] py-7 text-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border text-dim" aria-hidden>
        <PlugZap className="size-[17px]" />
      </span>
      <p className="max-w-[44ch] text-pretty text-[14px] text-mut">Questions are answered live by HydraDB, which is not reachable right now.</p>
      <p className="font-mono text-[12px] leading-[1.6] text-dim">nothing here is served from cache · reload to try again</p>
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
      out.push(`typosquats near ${ask.package}`, `MATCH (p:Package)-[r:NAME_SIMILAR_TO]->(q:Package) RETURN p.key, q.key, r.kind LIMIT 20`);
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
