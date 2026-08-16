import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { MotionConfig } from "motion/react";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Nav, MobileNav } from "./nav";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});
const jet = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jet",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Reachable", template: "%s · Reachable" },
  description:
    "Supply-chain incident response on a graph. When a package is compromised: which services are exposed, which resolved it while it was live, which actually need action.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("dark h-full antialiased", plex.variable, jet.variable)}
    >
      <body className="min-h-full font-sans">
        <MotionConfig reducedMotion="user">
          <div className="flex min-h-dvh">
            <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
              <Nav />
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Mobile only: the sidebar is hidden below md, so the header carries the menu + wordmark. */}
              <header className="sticky top-0 z-20 flex min-h-12 items-center gap-1 border-b border-border bg-background/85 px-2 backdrop-blur md:hidden">
                <MobileNav />
                <Link
                  href="/"
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                >
                  <span
                    className="grid size-5 place-items-center rounded-[5px] bg-signal shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]"
                    aria-hidden
                  >
                    <span className="block size-1.5 rounded-[2px] bg-background" />
                  </span>
                  <span className="text-[14px] font-semibold tracking-tight">
                    Reachable
                  </span>
                </Link>
              </header>
              <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">
                {children}
              </main>
            </div>
          </div>
        </MotionConfig>
      </body>
    </html>
  );
}
