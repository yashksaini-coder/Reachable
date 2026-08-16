"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
      className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 focus-within:border-line-2"
      role="search"
    >
      <span className="text-[10px] font-mono uppercase tracking-widest text-accent">ask</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="is owner/repo exposed to GHSA-… · what pulls chalk into owner/repo · MATCH (s:Service) RETURN s.key LIMIT 5"
        className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
        aria-label="Ask the graph"
      />
      <span className="kbd hidden md:inline">↵</span>
    </form>
  );
}
