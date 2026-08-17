"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Toasts — for API/network errors and short confirmations. Bottom-right (full-width bottom ≤900px),
// --pop surface, elev, at most three stacked,
// 5s auto-dismiss, `aria-live="polite"` (never steals focus). Tone: `error` carries the word
// "error" and a --l1 rule (amber is the app-wide "attention" tone for non-verdict states, chosen
// once here so l2 stays a verdict); `note` is neutral. Enters y6→0 300ms, exits 200ms.
type Toast = { id: number; title: string; detail?: string; tone: "error" | "note"; action?: { label: string; onClick: () => void } };
type Ctx = { push: (t: Omit<Toast, "id">) => void; error: (title: string, detail?: string) => void; note: (title: string, detail?: string) => void };

const ToastCtx = createContext<Ctx | null>(null);
const EASE = [0.32, 0.72, 0, 1] as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]); // at most three on screen
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), t.tone === "error" ? 7000 : 5000),
      );
    },
    [dismiss],
  );
  useEffect(() => {
    const m = timers.current;
    return () => m.forEach(clearTimeout);
  }, []);
  const ctx = useMemo<Ctx>(
    () => ({ push, error: (title, detail) => push({ title, detail, tone: "error" }), note: (title, detail) => push({ title, detail, tone: "note" }) }),
    [push],
  );
  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <Toaster items={items} dismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const c = useContext(ToastCtx);
  // Outside the provider (e.g. the landing) toasts degrade to no-ops rather than throwing.
  return c ?? { push: () => {}, error: () => {}, note: () => {} };
}

function Toaster({ items, dismiss }: { items: Toast[]; dismiss: (id: number) => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[360px] flex-col gap-2 max-[900px]:left-4 max-[900px]:right-4 max-[900px]:w-auto" role="region" aria-label="notifications">
      <div aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.3, ease: EASE } }}
              exit={{ opacity: 0, y: 4, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }}
              className={cn("pointer-events-auto relative overflow-hidden rounded-lg border border-border bg-pop pl-3.5 pr-10 py-3 elev", t.tone === "error" && "border-l-2 border-l-l1")}
            >
              <div className="flex items-baseline gap-2">
                <span className={cn("shrink-0 font-mono text-[11.5px] font-medium uppercase leading-none tracking-[0.1em]", t.tone === "error" ? "text-l1" : "text-signal")}>
                  {t.tone === "error" ? "error" : "note"}
                </span>
                <span className="text-[13.5px] leading-[1.4] text-fg">{t.title}</span>
              </div>
              {t.detail && <p className="mt-1 font-mono text-[12px] leading-[1.5] text-dim">{t.detail}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-2 inline-flex min-h-10 items-center rounded-md border border-border px-2.5 text-[12px] font-medium text-mut transition-colors duration-[180ms] hover:bg-hover hover:text-fg"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="dismiss"
                onClick={() => dismiss(t.id)}
                className="absolute right-1 top-1 grid size-8 place-items-center rounded-md text-dim transition-colors duration-[180ms] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
