import { Shell } from "@/components/console/nav";

// Console shell: sidebar + <main> scroll container. Pages render inside <main>; each page owns its
// own max-width/padding wrapper (1280px, 40px gutters — see the design handoff).
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return <Shell>{children}</Shell>;
}
