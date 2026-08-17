import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// Weight 500 is the maximum in this design — hierarchy is size and space, not weight — so 600 is
// not even loaded. The token sheet reads these variables as --font-sans / --font-mono.
const ui = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ui",
  display: "swap",
});
const code = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-code",
  display: "swap",
});

// Absolute URLs for link previews (server-only): SITE_URL if set, else Vercel's production URL, else :3000.
const site = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "Reachable", template: "%s · Reachable" },
  description:
    "Supply-chain incident console. When a package is compromised: which services are exposed, which pulled it in while it was still installable, and which actually need action.",
};

// Dark only: no theme provider, nothing to switch to.
export const viewport: Viewport = { themeColor: "#0a0b0e", colorScheme: "dark" };

// The root layout owns fonts and tokens only. The console shell lives in app/(console)/layout.tsx;
// the landing page in app/(landing) renders without it.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("dark h-full antialiased", ui.variable, code.variable)}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
