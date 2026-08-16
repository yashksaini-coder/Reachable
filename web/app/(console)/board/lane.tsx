import Link from "next/link";
import { LEVEL } from "@/lib/level";
import { cn } from "@/lib/utils";

export type Card = {
  href: string;
  slug: string;
  advisory: string;
  level: string;
  whileLive: boolean;
  via: string; // `via …` line — the direct/transitive dependency that pulled the version in
  sha: string;
  time: string;
  lockfiles: number;
};

// One board lane: 2px verdict-coloured top rule, 0 0 12px 12px radii, header (title · count in the
// lane colour · mono hint), then --card2 cards. Density is driven by the page-level compact switch
// (`group-has-[:checked]`), so the lane stays a server component.
export function Lane({ title, hint, tone, wide, cards }: { title: string; hint: string; tone: { border: string; text: string }; wide?: boolean; cards: Card[] }) {
  return (
    <section
      className={cn(
        "flex min-w-[248px] flex-col rounded-b-xl border border-border border-t-2 bg-card",
        wide ? "flex-[0_0_300px] group-has-[:checked]:flex-[0_0_272px]" : "flex-[0_0_272px]",
        tone.border,
      )}
    >
      <header className="border-b border-line px-3.5 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2.5">
          <span className="text-[12.5px] font-medium leading-[1.2] text-fg">{title}</span>
          <span className={cn("num text-[11px] font-medium leading-none", tone.text)} aria-label={`${cards.length} exposures`}>
            {cards.length}
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[10.5px] leading-[1.4] text-dim text-pretty">{hint}</div>
      </header>
      <div className="flex flex-col gap-2 p-2.5">
        {cards.length === 0 ? (
          <div className="grid min-h-11 place-items-center rounded-[9px] border border-dashed border-input px-3 py-3 text-center font-mono text-[10.5px] text-dim">nothing in this state</div>
        ) : (
          cards.map((c) => {
            const l = LEVEL[c.level] ?? LEVEL.unscanned;
            return (
              <Link
                key={`${c.advisory}:${c.slug}`}
                href={c.href}
                className="block min-h-11 w-full rounded-[9px] border border-border bg-card2 px-[13px] py-3 transition-[background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.98] group-has-[:checked]:px-[11px] group-has-[:checked]:py-[9px]"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <span className="truncate font-mono text-[12px] font-medium leading-none text-fg">{c.slug}</span>
                  <span className="shrink-0 font-mono text-[10.5px] leading-none text-signal">{c.advisory}</span>
                </div>
                <div className="mt-[9px] font-mono text-[11px] leading-[1.5] text-dim [overflow-wrap:anywhere] group-has-[:checked]:hidden">
                  via {c.via}
                  <br />
                  {c.sha} · {c.time}
                  <br />
                  <span className={l.text}>{l.label}</span>
                  {c.whileLive && <> · while live</>} · {c.lockfiles} lockfile{c.lockfiles === 1 ? "" : "s"}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
