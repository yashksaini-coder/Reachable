import Link from "next/link";
import { Search } from "lucide-react";

// 404: a 44px muted icon circle, one sentence, one outlined orange action. Nothing else.
export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-[18px] p-10 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-border text-dim" aria-hidden>
        <Search className="size-[17px]" />
      </span>
      <p className="max-w-[44ch] text-pretty text-[13.5px] text-mut">No report at that address — the advisory may not be tracked yet.</p>
      <Link
        href="/incidents"
        className="inline-flex min-h-10 items-center rounded-lg border border-signal/40 px-[15px] text-[12px] font-medium leading-none text-signal transition-[background-color] duration-[180ms] ease-[var(--ease)] hover:bg-sigfill active:scale-[0.97]"
      >
        Back to incidents
      </Link>
    </div>
  );
}
