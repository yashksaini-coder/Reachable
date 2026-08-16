import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AskBar } from "./ask/askbar";

export const metadata: Metadata = {
  title: "Reachable",
  description:
    "Supply-chain incident response on a graph. When a package is compromised: which services are exposed, which resolved it while it was live, which actually need action.",
};

const NAV = [
  { href: "/", label: "Incidents", hint: "blast radius per advisory" },
  { href: "/board", label: "Board", hint: "services by triage state" },
  { href: "/services", label: "Services", hint: "what is being watched" },
  { href: "/ask", label: "Ask", hint: "query the graph live" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel/60 md:flex">
            <Link href="/" className="flex items-center gap-2 px-5 py-4 text-[15px] font-semibold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
              Reachable
            </Link>
            <nav className="mt-2 flex flex-col gap-0.5 px-3">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-2 py-1.5 text-[13px] text-ink-2 hover:bg-panel-2 hover:text-ink"
                >
                  <div>{n.label}</div>
                  <div className="text-[10.5px] text-ink-3">{n.hint}</div>
                </Link>
              ))}
            </nav>
            <div className="mt-auto space-y-1 px-5 py-4 text-[10.5px] text-ink-3">
              <div>Traversal runs inside HydraDB.</div>
              <div>Every number is a measurement.</div>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/80 px-5 py-2.5 backdrop-blur">
              <Link href="/" className="font-semibold md:hidden">
                Reachable
              </Link>
              <div className="ml-auto w-full max-w-xl">
                <AskBar />
              </div>
            </header>
            <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
