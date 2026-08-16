import { listIncidents } from "@/lib/incident";

// README badge: reachable: <L2> of <exposed>. Computed from the committed incident JSON across
// every incident that touches this service; a service nobody has scanned says "unscanned".
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
  const value = exposed === 0 ? "0 exposed" : scanned ? `${l2} of ${exposed}` : `${exposed} exposed · unscanned`;
  const color = exposed === 0 ? "#3fb950" : !scanned ? "#8b949e" : l2 > 0 ? "#f85149" : "#d29922";
  const lw = 7 * label.length + 12;
  const vw = 7 * value.length + 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${label}: ${value}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<rect rx="3" width="${lw + vw}" height="20" fill="#555"/><rect rx="3" x="${lw}" width="${vw}" height="20" fill="${color}"/>
<rect rx="3" width="${lw + vw}" height="20" fill="url(#s)"/>
<g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${label}</text><text x="${lw + vw / 2}" y="14">${value}</text></g></svg>`;
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
