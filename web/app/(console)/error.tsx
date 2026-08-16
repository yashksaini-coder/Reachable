"use client";

import { useEffect } from "react";
import { Unplug } from "lucide-react";
import { StateView } from "@/components/console/states";

// Route error boundary for the console: one sentence, the error's own words in mono, one retry.
// Never a blank screen; never a stack trace in the product.
export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StateView
      icon={Unplug}
      sentence="This page could not be rendered — the live worker or the graph did not answer."
      action={{ label: "Try again", onClick: reset }}
      extra={<p className="max-w-[60ch] font-mono text-[11px] leading-[1.6] text-dim">{error.message.slice(0, 240)}{error.digest ? ` · ${error.digest}` : ""}</p>}
    />
  );
}
