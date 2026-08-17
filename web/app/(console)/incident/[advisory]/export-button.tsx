"use client";

import { FileDown } from "lucide-react";
import { usePrintMode } from "@/components/console/ui";

// Export PDF — outline button (the report keeps its one filled orange for the verdict rule).
// Sits at the right of the title row; ≤600px it drops below the pills as a full-width outline.
// Turns print mode on (every HydraCard / ShowAll open, no animation), sets the document title so
// Save-as-PDF proposes `reachable-<advisory>-report.pdf`, lets the browser paint two frames, opens
// the print dialog, then restores both once the dialog closes (afterprint). Hidden on paper.
export function ExportButton({ advisory }: { advisory: string }) {
  const { on, set } = usePrintMode();
  const go = () => {
    const was = on;
    const title = document.title;
    set(true);
    document.title = `reachable-${advisory}-report`;
    window.addEventListener(
      "afterprint",
      () => {
        set(was);
        document.title = title;
      },
      { once: true },
    );
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };
  return (
    <button
      type="button"
      onClick={go}
      className="ml-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-[12.5px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97] max-[600px]:ml-0 max-[600px]:mt-1 max-[600px]:w-full print:hidden"
    >
      <FileDown className="size-3.5" aria-hidden />
      Export PDF
    </button>
  );
}
