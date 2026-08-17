import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Mark } from "@/components/console/nav";

// The guide has its own chrome: no console sidebar. A slim sticky bar (mark · Reachable · guide) with
// one way back into the product; the document itself scrolls normally.
export default function DocsLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/[.92] backdrop-blur-[8px]">
        <div className="mx-auto flex h-[60px] max-w-[1520px] items-center gap-3 px-10 max-[900px]:px-5">
          <Link href="/" className="flex items-center gap-[9px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50" aria-label="Reachable home">
            <Mark />
            <span className="text-[15px] font-medium leading-none tracking-[-0.01em] text-fg">Reachable</span>
          </Link>
          <span className="text-dim" aria-hidden>·</span>
          <span className="text-[13.5px] leading-none text-mut">guide</span>
          <Link
            href="/incidents"
            className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium leading-none text-mut transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
          >
            open the console <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
