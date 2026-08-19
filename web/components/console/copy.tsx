"use client";

import { useState } from "react";
import { Check, Copy as CopyIcon } from "lucide-react";

// One copy control for the whole console and the guide: icon only, aria-label says what it copies.
export function Copy({ text, label = "copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <span className="inline-flex shrink-0 items-center gap-2 print:hidden" aria-live="polite">
      {state === "failed" && <span className="text-[11.5px] leading-none text-dim">copy failed — press ⌘C</span>}
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("done");
            setTimeout(() => setState("idle"), 1500);
          } catch {
            setState("failed");
            setTimeout(() => setState("idle"), 2000);
          }
        }}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97]"
      >
        {state === "done" ? <Check className="size-3.5 text-l0" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}
