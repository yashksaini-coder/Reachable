"use client";

import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { useToast } from "@/components/console/toast";
import { mcpConfig } from "@/lib/mcp";
import { cn } from "@/lib/utils";

type Minted = { token: string; name: string; ttl_days: number };

export const CARD = "elev overflow-hidden rounded-xl border border-border bg-card";
export const HEAD = "flex h-12 shrink-0 items-center justify-between border-b border-line px-[18px]";
export const PRE = "m-0 overflow-x-auto rounded-md border border-border bg-code p-3 font-mono text-[12.5px] leading-[1.65] text-signal-2";

export function Copy({ text, label = "copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setFailed(true);
          setTimeout(() => setFailed(false), 2000);
        }
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97]"
    >
      {done ? <Check className="size-3.5 text-l0" aria-hidden /> : null}
      {failed ? "press ⌘C" : done ? "copied" : label}
    </button>
  );
}

export function KeyMinter({ apiUrl, onMinted }: { apiUrl: string; onMinted?: (token: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<Minted | null>(null);
  const toast = useToast();

  const mcpJson = key ? mcpConfig({ apiUrl, token: key.token }) : "";

  async function mint(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const b = (await r.json().catch(() => ({}))) as Minted & { error?: string };
      if (r.ok && b.token) {
        setKey(b);
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
              className="h-11 min-w-0 flex-1 rounded-md border border-input bg-code px-3 font-mono text-[13px] text-fg placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
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
            <Copy text={key.token} label="copy key" />
          </div>
          <div className="flex flex-col gap-4 p-[18px]">
            <pre className={PRE}>{key.token}</pre>
            <div>
              <div className="label mb-2 flex items-center justify-between">
                <span>drop this into .mcp.json</span>
                <Copy text={mcpJson} label="copy config" />
              </div>
              <pre className={PRE}>{mcpJson}</pre>
            </div>
            <p className="text-[12.5px] leading-[1.6] text-dim">
              Restart your client after saving. Nothing here is stored in your browser — leave the page and the key is gone,
              so copy it now.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
