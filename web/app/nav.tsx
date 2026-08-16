"use client";

import Link from "next/link";
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
      <div className="mt-auto space-y-1 px-5 py-4 text-[10.5px] leading-relaxed text-muted-foreground">
        <div>Traversal runs inside HydraDB.</div>
        <div>Every number is a measurement.</div>
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
