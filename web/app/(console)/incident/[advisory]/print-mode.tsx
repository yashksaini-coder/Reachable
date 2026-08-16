"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PrintProvider, usePrintMode } from "@/components/console/ui";

// `?print=1` turns print mode on after hydration (the page stays force-static; the query is read
// on the client only, behind Suspense so the static shell prerenders untouched).
function FromQuery() {
  const sp = useSearchParams();
  const { set } = usePrintMode();
  const on = sp.get("print") === "1";
  useEffect(() => {
    if (on) set(true);
  }, [on, set]);
  return null;
}

export function PrintMode({ children }: { children: ReactNode }) {
  return (
    <PrintProvider>
      <Suspense fallback={null}>
        <FromQuery />
      </Suspense>
      {children}
    </PrintProvider>
  );
}
