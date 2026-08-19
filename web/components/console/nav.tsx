"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Menu, X } from "lucide-react";

import { GithubLink } from "@/components/github-link";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/console/toast";

// Sidebar spec (design handoff §Shell): fixed 236px, --bg, 1px right border, 100vh sticky.
// Six two-line items on a 46px pitch (44px item + 2px gap); the pitch is asserted by the item
// geometry, not the count, and the indicator is index-derived — adding an item needs nothing else; a 2px × 44px orange indicator slides
// on the left edge with translateY(index × 46px). Below 900px the sidebar is an off-canvas sheet
// (translateX(-101%), 300ms) behind a sticky 52px top bar, with a backdrop scrim. <main> — not the
// document — is the scroll container (100vh, overflow-y auto), so rail listeners target it.
const NAV = [
  {
    href: "/incidents",
    label: "Incidents",
    hint: "open advisories",
    match: (p: string) =>
      p.startsWith("/incidents") || p.startsWith("/incident/"),
  },
  {
    href: "/board",
    label: "Board",
    hint: "remediation lanes",
    match: (p: string) => p.startsWith("/board"),
  },
  {
    href: "/services",
    label: "Services",
    hint: "watched repositories",
    match: (p: string) => p.startsWith("/services"),
  },
  {
    href: "/ask",
    label: "Ask",
    hint: "query the graph",
    match: (p: string) => p.startsWith("/ask"),
  },
  {
    href: "/graph",
    label: "Graph",
    hint: "schema and explorer",
    match: (p: string) => p.startsWith("/graph"),
  },
  {
    href: "/keys",
    label: "MCP",
    hint: "keys and connectors",
    match: (p: string) => p.startsWith("/keys"),
  },
];
const PITCH = 46;

export function Mark({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
      className={cn("text-signal", className)}
    >
      <path d="M9 1.6 15.6 5v8L9 16.4 2.4 13V5z" />
      <path d="M9 6.2v5.6M6.2 7.6v2.8M11.8 7.6v2.8" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const idx = NAV.findIndex((n) => n.match(path)); // -1 on /docs: no item is current, indicator hides
  const onDocs = path.startsWith("/docs");

  // Route change closes the sheet (Link onClick), Escape closes it too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh items-stretch bg-bg">
        {/* scrim — the prototype omits it; the README asks for one */}
        <button
          type="button"
          aria-label="close navigation"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={cn(
            "fixed inset-0 z-50 hidden bg-bg/60 backdrop-blur-[2px] transition-opacity duration-300 ease-[var(--ease)] max-[900px]:block",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
        <aside
          data-open={open ? "1" : "0"}
          className={cn(
            "sticky top-0 flex h-dvh w-[236px] shrink-0 flex-col border-r border-border bg-bg",
            "max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-[60] max-[900px]:elev max-[900px]:transition-transform max-[900px]:duration-300 max-[900px]:ease-[var(--ease)]",
            open
              ? "max-[900px]:translate-x-0"
              : "max-[900px]:-translate-x-[101%]",
          )}
        >
          <div className="flex items-center gap-[9px] px-[18px] pb-[14px] pt-5">
            <Link
              href="/"
              className="flex items-center gap-[9px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
              aria-label="Reachable home"
            >
              <Mark />
              <span className="text-[15px] font-medium leading-none tracking-[-0.01em] text-fg">
                Reachable
              </span>
            </Link>
            {/* Docs is a guide, not a destination in the primary nav: one icon shortcut, always reachable */}
            <Link
              href="/docs"
              aria-label="Docs — how it works"
              title="Docs — how it works"
              aria-current={onDocs ? "page" : undefined}
              className={cn(
                "ml-auto grid size-10 place-items-center rounded-lg transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50",
                onDocs ? "bg-hover text-signal" : "text-mut",
              )}
            >
              <BookOpen className="size-4" />
            </Link>
            <GithubLink className="grid size-10 place-items-center rounded-lg text-mut transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="close navigation"
              className="hidden size-10 place-items-center rounded-lg text-mut hover:bg-hover hover:text-fg max-[900px]:grid"
            >
              <X className="size-4" />
            </button>
          </div>
          <nav
            aria-label="Primary"
            className="relative flex flex-col gap-0.5 px-2.5 py-2"
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-2.5 top-2 h-11 w-0.5 rounded-sm bg-signal transition-[transform,opacity] duration-300 ease-[var(--ease)]",
                idx < 0 && "opacity-0",
              )}
              style={{ transform: `translateY(${Math.max(0, idx) * PITCH}px)` }}
            />
            {NAV.map((n, i) => {
              const active = i === idx;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className="flex h-11 flex-col justify-center rounded-lg px-3 transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/50"
                >
                  <span
                    className={cn(
                      "text-[13.5px] font-medium leading-[1.35]",
                      active ? "text-fg" : "text-mut",
                    )}
                  >
                    {n.label}
                  </span>
                  <span className="text-[12px] leading-[1.35] text-dim">
                    {n.hint}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          <div className="px-4 pb-[18px] pt-[14px]">
            <Status />
          </div>
        </aside>

        <main
          id="console-main"
          className="h-dvh min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          <div className="sticky top-0 z-40 hidden h-[52px] items-center gap-3 border-b border-border bg-bg/[.92] px-4 backdrop-blur-[8px] max-[900px]:flex">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="open navigation"
              aria-expanded={open}
              className="grid size-10 place-items-center rounded-lg border border-border text-mut transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
            >
              <Menu className="size-4" />
            </button>
            <span className="text-[13.5px] font-medium leading-none">
              Reachable
            </span>
            <Link
              href="/docs"
              aria-label="Docs — how it works"
              className="ml-auto grid size-10 place-items-center rounded-lg text-mut transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
            >
              <BookOpen className="size-4" />
            </Link>
            <GithubLink className="grid size-10 place-items-center rounded-lg text-mut transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50" />
          </div>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}

type Health = {
  hydradb: string;
  worker: string;
  services: number | null;
  incidents: number;
};

// A status light, not a badge: 7px dot blipping at 1Hz (the only idle loop permitted) plus the
// state in 11px mono. Polls /api/health and never claims "up" from cached data.
// Liveness comes from whichever route this deployment can observe. Wired to neither means it is
// serving committed reports on purpose — `reports only` in --dim, never a verdict colour; L2 red
// is reserved for something wired up and silent.
// Labels stay under ~24 mono chars — the sidebar is 236px and the old 30-char label truncated.
function Status() {
  const [st, setSt] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = await r.json();
        if (alive)
          setSt({
            hydradb: j.hydradb,
            worker: j.worker,
            services: typeof j.services === "number" ? j.services : null,
            incidents: (j.incidents ?? []).length,
          });
      } catch {
        // The console itself did not answer; say nothing about the graph.
        if (alive) setSt({ hydradb: "down", worker: "down", services: null, incidents: 0 });
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const up = st != null && (st.worker === "up" || st.hydradb === "up");
  const idle = st != null && !up && st.worker === "unconfigured" && st.hydradb === "unconfigured";
  const label =
    st == null
      ? "HydraDB …"
      : up
        ? st.services != null
          ? `HydraDB up · ${st.services} services`
          : "HydraDB up"
        : idle
          ? "reports only"
          : "HydraDB down";

  return (
    <div
      className="flex min-w-0 items-center gap-[9px] rounded-lg border border-border bg-card px-[11px] py-[9px]"
      role="status"
      aria-live="polite"
      title={st ? `worker ${st.worker} · node ${st.hydradb} · ${st.incidents} incidents` : undefined}
    >
      <span
        aria-hidden
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          st == null || idle
            ? "bg-dim"
            : up
              ? "bg-l0 shadow-[0_0_0_3px_rgba(47,208,127,.14)] blip"
              : "bg-l2 shadow-[0_0_0_3px_rgba(255,92,92,.14)]",
        )}
      />
      <span className="min-w-0 truncate font-mono text-[11px] leading-[1.3] text-mut">{label}</span>
    </div>
  );
}
