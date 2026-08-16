// Pure formatting helpers, safe in client and server components alike.
export const short = (key: string) => key.replace(/^(pkg:npm\/|svc:|lock:|npm:|pkg:fx\/|fx:)/, "");
export const svcSlug = (key: string) => key.replace(/^svc:/, "");
export const fmtMs = (ms: number | null | undefined) =>
  ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 2 : 0)} ms`;
export const fmtUtc = (iso: string | null | undefined) =>
  iso ? iso.replace("T", " ").replace(/\+00:00$/, "Z").replace(/\.\d+Z$/, "Z") : "—";
