import { cn } from "@/lib/utils";

// Loading skeletons for the live pages: the real layout's bones in --card2 blocks that shimmer
// once (opacity blip). Space is reserved so content never jumps in (CLS), and the numbers that
// arrive are real — a skeleton is the only place a placeholder is allowed to stand in for data.
export function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-[fade_1.2s_var(--ease)_infinite_alternate] rounded-md bg-card2", className)} />;
}

export function PageSkeleton({ stats = 0, rows = 6, wide }: { stats?: number; rows?: number; wide?: boolean }) {
  return (
    <div className={cn("mx-auto max-w-[1280px] px-10 py-[52px] pb-[72px] max-[900px]:px-5", wide && "max-w-none")} aria-busy="true" aria-label="loading">
      <Bone className="h-6 w-40" />
      <Bone className="mt-3 h-3.5 w-80" />
      {stats > 0 && (
        <div className="mt-8 grid overflow-hidden rounded-xl border border-border" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(132px, 1fr))` }}>
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="cell-lines bg-card px-4 pb-[18px] pt-4">
              <Bone className="mb-3.5 h-0.5 w-[22px]" />
              <Bone className="h-8 w-16" />
              <Bone className="mt-2 h-2.5 w-20" />
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 rounded-2xl border border-border bg-card p-[18px] elev">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line py-3.5 last:border-b-0">
            <Bone className="h-3.5 w-1/3" />
            <Bone className="h-3.5 w-16" />
            <Bone className="ml-auto h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
