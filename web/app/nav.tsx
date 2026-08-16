"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, KanbanSquare, MessageSquareCode, Network, Radar, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Incidents", hint: "blast radius per advisory", icon: Radar },
  { href: "/board", label: "Board", hint: "services by triage state", icon: KanbanSquare },
  { href: "/services", label: "Services", hint: "what is being watched", icon: Activity },
  { href: "/ask", label: "Ask", hint: "query the graph live", icon: MessageSquareCode },
  { href: "/graph", label: "Graph", hint: "counts, schema, ingest jobs", icon: Network },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/incident") : path.startsWith(href);
}

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <>
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 py-4">
        <span className="grid size-6 place-items-center rounded-md bg-signal text-background">
          <span className="block size-2 rounded-[2px] bg-background" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Reachable</span>
      </Link>
      <nav className="mt-1 flex flex-col gap-0.5 px-3" aria-label="Primary">
        {NAV.map((n) => {
          const active = isActive(path, n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-11 items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] transition-colors",
                active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-signal" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={1.75} />
              <span className="flex flex-col leading-tight">
                <span>{n.label}</span>
                <span className="text-[10.5px] text-muted-foreground">{n.hint}</span>
              </span>
              {active && <span className="ml-auto h-4 w-0.5 rounded bg-signal" aria-hidden />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-4 py-4">
        <Status />
      </div>
    </>
  );
}

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        }
      />
      <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Nav />
      </SheetContent>
    </Sheet>
  );
}


// Live status of the engine behind the console. Polls /api/health (server-side probe); never
// claims "live" from cached data.
function Status() {
  const [st, setSt] = useState<{ hydradb: string; incidents: number; api?: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = await r.json();
        if (alive) setSt({ hydradb: j.hydradb, incidents: (j.incidents ?? []).length, api: j.api });
      } catch {
        if (alive) setSt({ hydradb: "down", incidents: 0 });
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const up = st?.hydradb === "up";
  return (
    <Link href="/graph" className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-[11px] text-muted-foreground transition-colors hover:border-signal/40" title="engine status · open Graph">
      <span className={cn("size-1.5 rounded-full", st == null ? "bg-muted-foreground" : up ? "bg-l0" : "bg-l2")} aria-hidden />
      <span className="font-mono">HydraDB</span>
      <span>{st == null ? "…" : up ? "up" : st.hydradb === "unconfigured" ? "no token" : "down"}</span>
      {st && <span className="ml-auto num">{st.incidents} incident{st.incidents === 1 ? "" : "s"}</span>}
    </Link>
  );
}
