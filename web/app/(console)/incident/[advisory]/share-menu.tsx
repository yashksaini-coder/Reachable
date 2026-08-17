"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Share2 } from "lucide-react";
import { useToast } from "@/components/console/toast";
import { cn } from "@/lib/utils";

// Share — outline button (the report keeps its one filled orange), opens a small --pop popover of
// copy/download rows. Copies fetch /incident/<id>/export?format=… and write the text to the
// clipboard; downloads are plain links with ?download=1. Escape / outside click closes. Hidden on paper.
const EASE = [0.32, 0.72, 0, 1] as const;
const ROW =
  "grid min-h-10 w-full rounded-md px-3 text-left text-[12.5px] leading-none text-mut transition-[color,background-color] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 [&>*]:[grid-area:1/1]";

type Row = { label: string; kind: "copy" | "download"; format?: "md" | "slack" | "discord" | "json"; text?: () => string };

export function ShareMenu({ advisory }: { advisory: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const toast = useToast();
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : { duration: 0.25, ease: EASE };
  const base = `/incident/${advisory}`;
  const exp = (format: string, download = false) => `${base}/export?format=${format}${download ? "&download=1" : ""}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const rows: Row[] = [
    { label: "Copy for Slack", kind: "copy", format: "slack" },
    { label: "Copy for Discord", kind: "copy", format: "discord" },
    { label: "Copy Markdown", kind: "copy", format: "md" },
    { label: "Download .md", kind: "download", format: "md" },
    { label: "Download .json", kind: "download", format: "json" },
    { label: "Copy link", kind: "copy", text: () => `${location.origin}${base}` },
    { label: "Copy print link", kind: "copy", text: () => `${location.origin}${base}?print=1` },
  ];

  // Safari drops the user activation across an await, so formats that need a fetch are written as
  // a promise-backed ClipboardItem synchronously inside the click; browsers without ClipboardItem
  // fall back to fetch-then-writeText.
  const copy = async (r: Row) => {
    try {
      if (r.format) {
        const blob = fetch(exp(r.format)).then((res) => {
          if (!res.ok) throw new Error(`export ${res.status}`);
          return res.blob();
        });
        if (typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob.then((b) => b.text()).then((t) => new Blob([t], { type: "text/plain" })) })]);
        } else {
          await navigator.clipboard.writeText(await (await blob).text());
        }
      } else {
        await navigator.clipboard.writeText(r.text?.() ?? "");
      }
      setDone(r.label);
      setTimeout(() => setDone(null), 1500);
    } catch (e) {
      toast.error("copy failed", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div ref={root} className="relative max-[600px]:mt-1 max-[600px]:w-full print:hidden">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-[12.5px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97]"
      >
        <Share2 className="size-3.5" aria-hidden />
        Share
      </button>
      {open && (
        <div id={id} className="absolute right-0 top-[calc(100%+6px)] z-40 w-[228px] rounded-lg border border-border bg-pop p-1.5 elev animate-[en_.2s_var(--ease)_both] max-[600px]:left-0 max-[600px]:w-full">
          {rows.map((r) =>
            r.kind === "download" ? (
              <a key={r.label} href={exp(r.format!, true)} download onClick={() => setOpen(false)} className={cn(ROW, "items-center")}>
                <span className="inline-flex items-center">{r.label}</span>
              </a>
            ) : (
              <button key={r.label} type="button" onClick={() => copy(r)} className={ROW}>
                <motion.span initial={false} animate={done === r.label ? { opacity: 0, scale: 0.25, filter: "blur(4px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }} transition={t} className="inline-flex items-center">
                  {r.label}
                </motion.span>
                <motion.span initial={false} animate={done === r.label ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }} transition={t} className="inline-flex items-center gap-1.5 text-l0" aria-live="polite">
                  <Check className="size-3.5" aria-hidden />
                  copied
                </motion.span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
