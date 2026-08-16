"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
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

const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/incident") : path.startsWith(href);
}

// `id` scopes the sliding indicator: the sidebar and the mobile sheet each mount a Nav, and a shared
// layoutId across both would make the indicator jump between them.
export function Nav({ id = "sidebar", onNavigate }: { id?: string; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <LayoutGroup id={id}>
      <Link
        href="/"
        onClick={onNavigate}
        className="group flex items-center gap-2.5 rounded-md px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50"
      >
        <span className="grid size-6 place-items-center rounded-md bg-signal text-background shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_1px_2px_rgba(0,0,0,0.6)] transition-transform group-active:scale-[0.96]">
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
                "group relative flex min-h-11 items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50",
                active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-indicator"
                  transition={SPRING}
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-signal"
                  aria-hidden
                />
              )}
              <Icon
                className={cn("size-4 shrink-0 transition-colors duration-150", active ? "text-signal" : "text-muted-foreground group-hover:text-foreground")}
                strokeWidth={1.75}
              />
              <span className="flex flex-col leading-tight">
                <span>{n.label}</span>
                <span className="text-[10.5px] text-muted-foreground">{n.hint}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-4 py-4">
        <Status />
      </div>
    </LayoutGroup>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon-lg" className="size-10 md:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        }
      />
      {/* Slides in from its own edge (not the shadcn 2.5rem nudge); ease-out curve tuned to read like the
          nav spring (0.3 s, no bounce). CSS transitions cannot run a real spring, so this is an approximation. */}
      <SheetContent
        side="left"
        className="flex w-72 flex-col bg-sidebar p-0 duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] data-[side=left]:data-ending-style:translate-x-[-100%] data-[side=left]:data-starting-style:translate-x-[-100%] data-ending-style:duration-200"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Nav id="sheet" onNavigate={() => setOpen(false)} />
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
    <Link
      href="/graph"
      className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-[11px] text-muted-foreground elev transition-[border-color,transform] duration-150 hover:border-signal/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
      title="engine status · open Graph"
    >
      {/* Pulses only while the answer is unknown; a steady dot means a measured answer. */}
      <span className={cn("size-1.5 rounded-full", st == null ? "animate-pulse bg-muted-foreground" : up ? "bg-l0" : "bg-l2")} aria-hidden />
      <span className="font-mono">HydraDB</span>
      <span>{st == null ? "…" : up ? "up" : st.hydradb === "unconfigured" ? "no token" : "down"}</span>
      {st && (
        <span className="num ml-auto">
          {st.incidents} incident{st.incidents === 1 ? "" : "s"}
        </span>
      )}
    </Link>
  );
}
