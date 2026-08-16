import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AskBar } from "./ask/askbar";
import { Nav, MobileNav } from "./nav";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });
const jet = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jet", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Reachable", template: "%s · Reachable" },
  description:
    "Supply-chain incident response on a graph. When a package is compromised: which services are exposed, which resolved it while it was live, which actually need action.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("dark h-full antialiased", plex.variable, jet.variable)}>
      <body className="min-h-full font-sans">
        <div className="flex min-h-dvh">
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
            <Nav />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur md:px-6">
              <MobileNav />
              <div className="ml-auto w-full max-w-2xl">
                <AskBar />
              </div>
            </header>
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
