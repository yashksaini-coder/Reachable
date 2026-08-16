import "./landing.css";

// The landing renders without the console shell: full-bleed, its own sticky header.
export default function LandingLayout({ children }: LayoutProps<"/">) {
  return <div className="landing min-h-dvh">{children}</div>;
}
