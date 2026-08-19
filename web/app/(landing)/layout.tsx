import "./landing.css";
import { LoaderGate } from "@/components/landing/loader-gate";

// The landing renders without the console shell: full-bleed, its own sticky header.
// The loader mounts inside .landing because landing.css scopes every custom property to it.
export default function LandingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="landing min-h-dvh">
      <LoaderGate />
      {children}
    </div>
  );
}
