"use client";

import { FileDown } from "lucide-react";
import { usePrintMode } from "@/components/console/ui";

// Export PDF — outline button (the report keeps its one filled orange for the verdict rule).
// Turns print mode on (every HydraCard / ShowAll open, no animation), lets the browser paint two
// frames, opens the print dialog, then restores the previous mode. Hidden on paper.
export function ExportButton() {
  const { on, set } = usePrintMode();
  const go = () => {
    const was = on;
    set(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        set(was);
      }),
    );
  };
  return (
    <button
      type="button"
      onClick={go}
      className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-[11.5px] font-medium leading-none text-mut transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.97] print:hidden"
    >
      <FileDown className="size-3.5" aria-hidden />
      Export PDF
    </button>
  );
}
