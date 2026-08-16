"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

// Global ask bar: submits to /ask?q=… (server-rendered answer). Client-side only for the input.
export function AskBar({ initial = "" }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/ask?q=${encodeURIComponent(q.trim())}`);
      }}
      className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 transition-colors focus-within:border-signal/60 focus-within:ring-2 focus-within:ring-signal/20"
      role="search"
    >
      <Search className="size-3.5 shrink-0 text-signal" strokeWidth={2} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="is owner/repo exposed to GHSA-… · what pulls chalk into owner/repo · MATCH (s:Service) RETURN s.key LIMIT 5"
        className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
        aria-label="Ask the graph"
      />
      <kbd className="hidden rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">↵</kbd>
    </form>
  );
}
