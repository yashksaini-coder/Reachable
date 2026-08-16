import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Compass className="size-4" strokeWidth={1.75} />
      </span>
      <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">404 · no such node</div>
      <h1 className="mt-2 text-balance text-[22px] font-semibold leading-tight tracking-tight">Nothing here is reachable.</h1>
      <p className="mt-2 text-pretty text-[13px] text-muted-foreground">
        The page you asked for is not in the graph. Incidents live under <code className="font-mono text-foreground">/incident/&lt;advisory&gt;</code>.
      </p>
      <Link
        href="/incidents"
        className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3.5 text-[13px] text-foreground elev transition-[border-color,transform,box-shadow] duration-150 hover:border-signal/40 hover:elev-2 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
      >
        <ArrowLeft className="size-4 text-signal" strokeWidth={1.75} /> Back to incidents
      </Link>
    </div>
  );
}
