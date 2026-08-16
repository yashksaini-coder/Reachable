import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reachable — supply chain incident response on a graph",
  description:
    "When an npm package is compromised: which services are exposed, which resolved it while it was live, which need action tonight. HydraDB does the traversal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-orange-400">◆</span> Reachable
            </Link>
            <span className="text-xs text-zinc-500">supply chain incident response on a graph</span>
            <nav className="ml-auto flex gap-4 text-xs text-zinc-400">
              <a href="https://github.com/hydra-db/hydradb" className="hover:text-zinc-100" target="_blank" rel="noreferrer">
                HydraDB
              </a>
              <a href="https://github.com/yashksaini-coder/Reachable" className="hover:text-zinc-100" target="_blank" rel="noreferrer">
                source
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-8 text-[11px] text-zinc-600">
          Every number on these pages is a measurement recorded in the committed incident JSON. Traversal runs inside
          HydraDB (OSS engine, Bolt); nothing here is computed from a cache. Built for Hack Hydra 2026, Track 02A.
        </footer>
      </body>
    </html>
  );
}
