// Verdict vocabulary — the four levels and what each may claim. Colours are semantic only.
// Lives in a plain module (no "use client") so Server Components can read it: exports of a client
// module become client references on the server and are unusable as data.
export const LEVEL: Record<string, { label: string; short: string; text: string; bg: string; dot: string; hex: string; hint: string }> = {
  L2: { label: "L2 act now", short: "L2", text: "text-l2", bg: "bg-l2/14", dot: "bg-l2", hex: "#ff5c5c", hint: "vulnerable symbol referenced in first-party code" },
  L1: { label: "L1 imported", short: "L1", text: "text-l1", bg: "bg-l1/14", dot: "bg-l1", hex: "#f5b400", hint: "package imported by first-party code; symbol not referenced" },
  L0: { label: "L0 present only", short: "L0", text: "text-l0", bg: "bg-l0/14", dot: "bg-l0", hex: "#2fd07f", hint: "in the install tree; never imported by scanned files" },
  unscanned: {
    label: "unscanned",
    short: "unscanned",
    text: "text-unknown",
    bg: "bg-unknown/14",
    dot: "bg-unknown",
    hex: "#8b93a7",
    hint: "no source files ingested — reachability unknown, never assumed safe",
  },
};

