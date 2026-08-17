import Link from "next/link";
import Image from "next/image";
import { Network, Search, Unplug, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Designed empty / missing / error states: a 44px muted icon circle, one sentence in --mut
// (max 44ch), optional second dim line, one outlined orange action. Vertically centred in
// whatever slot it sits in — full page by default, or a card slot via `className` (h-full etc.).
export const ACTION =
  "inline-flex min-h-10 items-center rounded-lg border border-signal/40 px-[15px] text-[13px] font-medium leading-none text-signal transition-[background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-sigfill active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50";

export function StateView({
  icon: Icon = Search,
  sentence,
  hint,
  action,
  extra,
  className,
}: {
  icon?: LucideIcon;
  sentence: string;
  hint?: string;
  action?: { href?: string; label: string; onClick?: () => void };
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[70vh] flex-col items-center justify-center gap-3 p-10 text-center", className)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border text-dim" aria-hidden>
        <Icon className="size-[17px]" />
      </span>
      <p className="max-w-[44ch] text-pretty text-[14px] leading-[1.5] text-mut">{sentence}</p>
      {hint && <p className="-mt-1.5 max-w-[44ch] text-pretty font-mono text-[12px] leading-[1.5] text-dim">{hint}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className={cn(ACTION, "mt-1.5")}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={cn(ACTION, "mt-1.5")}>
            {action.label}
          </button>
        ))}
      {extra}
    </div>
  );
}

// 404 carries the one piece of art the product allows on an empty surface: a chain of nodes that
// breaks into nothing (asset pack, pixel art — served at half its source width, never filtered).
export function NotFoundView() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-[18px] p-10 text-center">
      <Image src="/art/404-strip.png" alt="" width={512} height={115} className="pixel max-w-full opacity-90" unoptimized priority />
      <p className="max-w-[44ch] text-pretty text-[14px] leading-[1.5] text-mut">No page at that address — the advisory or service may not be tracked yet.</p>
      <Link href="/incidents" className={ACTION}>
        Back to incidents
      </Link>
    </div>
  );
}

export { Unplug };

// Compact empty state for a slot inside a card (tables, canvases, lists): 44px circle + one sentence.
export function EmptySlot({ icon: Icon = Network, children, className }: { icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[120px] flex-col items-center justify-center gap-3 px-5 py-4 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full border border-border text-dim" aria-hidden>
        <Icon className="size-[17px]" />
      </span>
      <p className="m-0 max-w-[44ch] text-pretty text-[13.5px] leading-[1.5] text-mut">{children}</p>
    </div>
  );
}

// Wide SVG scroller: keeps the 1000px floor, contains overscroll, and shows a thin bottom scrollbar
// so the cut-off edge is never mistaken for the end of the drawing.

// Wide SVG/table scroller: keeps the content floor, contains overscroll, shows a thin scrollbar so
// the cut-off edge is never mistaken for the end of the drawing.
export const SCROLLER = "overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [scrollbar-color:var(--color-input)_transparent]";
