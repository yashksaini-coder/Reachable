import { short } from "@/lib/format";
import { cn } from "@/lib/utils";

// Proving-path chain — the signature of the service detail. A horizontal node-link strip read
// right-to-left from the affected version: each node is a --card2 box (id in 11.5px mono, kind
// beneath in 10.5px uppercase mono --dim), joined by a 34×7 left-pointing arrow with the relationship
// (`←DEPENDS_ON←`, `←RESOLVED←`) above it. The affected version's node is stroked l2/40 with l2 text.
// Pure markup from props — a Server Component. Callers wrap it in `overflow-x-auto`; `min-w-max`
// keeps it from wrapping so it scrolls inside its card instead of breaking the body.

const kindOf = (id: string, i: number) => (i === 0 ? "version" : id.startsWith("lock:") ? "lockfile" : "dependency");

export function Chain({ chain, className }: { chain: string[]; className?: string }) {
  return (
    <div className={cn("flex min-w-max items-center gap-0.5", className)}>
      {chain.map((el, i) =>
        i % 2 === 1 ? (
          <div key={i} className="flex flex-col items-center gap-1 px-1">
            <span className="font-mono text-[10.5px] leading-none tracking-[0.04em] text-dim">←{el}←</span>
            <svg width="34" height="7" viewBox="0 0 34 7" aria-hidden className="text-input">
              <path d="M33 3.5H1M6 1 1 3.5 6 6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </div>
        ) : (
          <span
            key={i}
            className={cn(
              "inline-flex flex-col gap-1 whitespace-nowrap rounded-lg border bg-card2 px-2.5 py-2",
              i === 0 ? "border-l2/40" : "border-border",
            )}
          >
            <span className={cn("font-mono text-[11.5px] leading-none", i === 0 ? "text-l2" : "text-fg")}>{short(el)}</span>
            <span className="font-mono text-[10.5px] uppercase leading-none tracking-[0.06em] text-dim">{kindOf(el, i)}</span>
          </span>
        ),
      )}
    </div>
  );
}
