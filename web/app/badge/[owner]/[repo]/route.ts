import { listIncidents } from "@/lib/incident";

// README badge: reachable: <L2> of <exposed>. Computed from the committed incident JSON across
// every incident that touches this service; a service nobody has scanned says "unscanned", and a
// service that appears in no composed incident says so in --mut — never green (rule 3).
// 168x22 SVG, two cells: --card2 left cell "reachable" in --mut, right cell a verdict dot + verdict
// text in the verdict colour on --card with a #232733 border. Pure server code — no client imports.
const MUT = "#a9afbd";
const VERDICT = { l2: "#ff5c5c", l1: "#f5b400", l0: "#2fd07f", unknown: "#8b93a7" } as const;

export async function GET(_req: Request, ctx: RouteContext<"/badge/[owner]/[repo]">) {
  const { owner, repo } = await ctx.params;
  const key = `svc:${owner}/${repo.replace(/\.svg$/, "")}`;
  let exposed = 0;
  let l2 = 0;
  let scanned = false;
  for (const inc of await listIncidents()) {
    if (!inc.q1_exposed.services.includes(key)) continue;
    exposed += 1;
    const lv = inc.q7_reachability[key]?.level;
    if (lv && lv !== "unscanned") scanned = true;
    if (lv === "L2") l2 += 1;
  }
  const label = "reachable";
  const value = exposed === 0 ? "no exposure recorded" : scanned ? `${l2} of ${exposed}` : `${exposed} exposed · unscanned`;
  const color = exposed === 0 ? MUT : !scanned ? VERDICT.unknown : l2 > 0 ? VERDICT.l2 : VERDICT.l1;
  // 168 wide by design; grows only when the value would not fit its cell (11px mono ≈ 6.6px/char).
  const w = Math.max(168, Math.ceil(98 + value.length * 6.6 + 11));
  const font = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" viewBox="0 0 ${w} 22" role="img" aria-label="${label}: ${value}">
<rect x=".5" y=".5" width="${w - 1}" height="21" rx="4" fill="#0f1116" stroke="#232733"/>
<rect x=".5" y=".5" width="74" height="21" rx="4" fill="#131620"/>
<text x="11" y="15" fill="${MUT}" font-family="${font}" font-size="11">${label}</text>
<circle cx="88" cy="11" r="3.5" fill="${color}"/>
<text x="98" y="15" fill="${color}" font-family="${font}" font-size="11" font-weight="500">${value}</text>
</svg>`;
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
