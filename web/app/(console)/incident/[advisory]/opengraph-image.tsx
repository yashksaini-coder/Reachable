import { ImageResponse } from "next/og";
import { readIncident, listIncidents, fmtUtc } from "@/lib/incident";
import { LEVEL } from "@/lib/level";

// Social card for one incident report — the same numbers as the page header, nothing estimated.
// Fonts: no network at build time and next/font files are woff2 (satori can't read them), so the
// bundled default sans is used throughout; "mono" is a fallback that only bites if a mono face is registered.
export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Reachable incident report card";
export async function generateStaticParams() {
  return (await listIncidents()).map((i) => ({ advisory: i.advisory.key }));
}

const C = { bg: "#0a0b0e", card: "#0f1116", border: "#1e2330", fg: "#e6e8ee", mut: "#a9afbd", dim: "#8b93a7", signal: "#ff6a1a" };
const MONO = "ui-monospace, monospace";
const RANK = ["L2", "L1", "unscanned", "L0"] as const;

export default async function Image({ params }: { params: Promise<{ advisory: string }> }) {
  const { advisory } = await params;
  const inc = await readIncident(advisory);
  const h = inc?.headline;
  const worst = inc ? RANK.find((l) => Object.values(inc.q7_reachability).some((r) => r.level === l)) ?? (h?.services_exposed ? "unscanned" : null) : null;
  const tiles: { label: string; n: number | string; color?: string }[] = h
    ? [
        { label: "services exposed", n: h.services_exposed },
        { label: "act now", n: h.reachable_L2, color: h.reachable_L2 > 0 ? LEVEL.L2.hex : undefined },
        { label: "resolved while live", n: h.resolved_while_live ?? "n/a", color: LEVEL.L1.hex },
        { label: "maintainer packages", n: inc!.q4_maintainers.rows.length },
        { label: "look-alike names", n: Object.values(inc!.q5_typosquats).reduce((n, s) => n + s.rows.length, 0) },
        { label: "unscanned", n: h.unscanned, color: LEVEL.unscanned.hex },
      ]
    : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.fg, padding: "56px 64px", fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 4, background: C.signal }} />
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 20, letterSpacing: 2, color: C.signal }}>reachable · incident report</div>
        <div style={{ display: "flex", marginTop: 22, fontFamily: MONO, fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>{advisory}</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 30, color: C.mut, lineHeight: 1.25 }}>
          {inc ? inc.advisory.summary : "Incident report — open the console for the traced path and every measured number."}
        </div>
        {inc ? (
          <div style={{ display: "flex", gap: 14, marginTop: 40 }}>
            {tiles.map((t) => (
              <div key={t.label} style={{ display: "flex", flexDirection: "column", flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 18px 16px" }}>
                <div style={{ display: "flex", fontFamily: MONO, fontSize: 44, fontWeight: 700, lineHeight: 1, color: t.color ?? C.fg }}>{t.n}</div>
                <div style={{ display: "flex", marginTop: 12, fontSize: 16, color: C.dim, lineHeight: 1.2 }}>{t.label}</div>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between", fontSize: 18, color: C.dim }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {worst ? (
              <div style={{ display: "flex", fontFamily: MONO, fontSize: 24, fontWeight: 700, color: LEVEL[worst].hex }}>{LEVEL[worst].label}</div>
            ) : null}
            <div style={{ display: "flex" }}>{inc ? `published ${fmtUtc(inc.advisory.published_at_iso).slice(0, 10)}` : "reachable"}</div>
          </div>
          <div style={{ display: "flex", textAlign: "right", maxWidth: 560 }}>every statement executed on HydraDB · numbers measured, never estimated</div>
        </div>
      </div>
    ),
    size,
  );
}
