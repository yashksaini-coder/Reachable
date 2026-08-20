"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Copy } from "@/components/console/copy";
import { useToast } from "@/components/console/toast";
import { KEY_HEAD, KEY_TAIL, maskToken, mcpConfig } from "@/lib/mcp";
import { cn } from "@/lib/utils";

type Minted = { token: string; name: string; ttl_days: number };

export const CARD = "elev overflow-hidden rounded-xl border border-border bg-card";
export const HEAD = "flex h-12 shrink-0 items-center justify-between border-b border-line px-[18px]";
export const PRE = "m-0 overflow-x-auto rounded-md border border-border bg-code p-3 font-mono text-[12.5px] leading-[1.65] text-signal-2";

const SETTLE_MS = 900;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 0 → 1 once per minted key. The key arrives as noise and resolves left to right, so a viewer sees
 *  it being made rather than finding it already there. Reduced motion gets the settled value. */
function useSettle(trigger: string | undefined): number {
  const [p, setP] = useState(1);
  useEffect(() => {
    if (!trigger) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }
    setP(0);
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      const q = Math.min(1, (now - start) / SETTLE_MS);
      setP(q);
      if (q < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [trigger]);
  return p;
}

function settle(text: string, p: number): string {
  if (p >= 1) return text;
  const done = Math.round(p * text.length);
  let out = text.slice(0, done);
  for (let i = done; i < text.length; i++) out += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return out;
}

export function KeyMinter({
  endpoint,
  revealed = false,
  onReveal,
  onMinted,
}: {
  endpoint: string;
  revealed?: boolean;
  onReveal?: (next: boolean) => void;
  onMinted?: (token: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<Minted | null>(null);
  const toast = useToast();

  const progress = useSettle(key?.token);
  const shownToken = key ? (revealed ? key.token : maskToken(key.token)) : "";
  const chars = settle(shownToken, progress);

  async function mint(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const b = (await r.json().catch(() => ({}))) as Minted & { error?: string };
      if (r.ok && b.token) {
        setKey(b);
        onReveal?.(false);
        onMinted?.(b.token);
        toast.done("key generated", `read-only · expires in ${b.ttl_days} days · shown once`);
      } else {
        toast.error("could not generate a key", b.error ?? `HTTP ${r.status}`);
      }
    } catch {
      toast.error("live data unavailable", "the graph did not answer — try again in a moment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={mint} className={CARD}>
        <div className={HEAD}>
          <span className="label">generate a key</span>
          <span className="font-mono text-[12px] text-dim">read-only · 7 days</span>
        </div>
        <div className="flex flex-col gap-3 p-[18px]">
          <div className="flex gap-2 max-[600px]:flex-col">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="what is it for — e.g. my laptop"
              maxLength={60}
              className="h-11 min-h-11 min-w-0 flex-1 rounded-md border border-input bg-code px-3 font-mono text-[13px] text-fg placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
            />
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-signal px-4 text-[13px] font-medium leading-none text-ink transition-[filter,transform] duration-[180ms] ease-[var(--ease)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97]",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <KeyRound className="size-4" aria-hidden />
              {busy ? "generating…" : "Generate"}
            </button>
          </div>
          <p className="text-[12.5px] leading-[1.6] text-dim">
            The key reads the graph. It cannot add a repository, start an ingest or spend this worker&rsquo;s GitHub budget —
            those stay with the operator. It expires on its own, and minting is rate-limited.
          </p>
        </div>
      </form>

      {key && (
        <div className={CARD}>
          <div className={HEAD}>
            <span className="label">your key — shown once</span>
            <span className="inline-flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onReveal?.(!revealed)}
                aria-pressed={revealed}
                aria-label={revealed ? "hide the key" : "reveal the key"}
                title={revealed ? "hide the key" : "reveal the key"}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97]"
              >
                {revealed ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              </button>
              <Copy text={key.token} label="copy key" />
            </span>
          </div>
          <div className="flex flex-col gap-4 p-[18px]">
            <pre className={cn(PRE, "text-[13px] tracking-[0.02em]")} aria-label="your generated key">
              <span>{chars.slice(0, KEY_HEAD)}</span>
              <span className={revealed ? undefined : "text-dim"}>{chars.slice(KEY_HEAD, chars.length - KEY_TAIL)}</span>
              <span>{chars.slice(chars.length - KEY_TAIL)}</span>
            </pre>
            <div>
              <div className="label mb-2 flex items-center justify-between gap-3">
                <span>drop this wherever your client keeps its MCP servers</span>
                <Copy text={mcpConfig({ endpoint, token: key.token })} label="copy config" />
              </div>
              <pre className={PRE}>{mcpConfig({ endpoint, token: shownToken })}</pre>
            </div>
            <p className="text-[12.5px] leading-[1.6] text-dim">
              Masked so it survives a shared screen — the copy buttons always send the whole key. Restart your client after
              saving. Nothing here is stored in your browser: leave the page and the key is gone, so copy it now.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
