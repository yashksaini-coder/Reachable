import { readIncident } from "@/lib/incident";
import { FORMATS, MIME, render, type Format } from "@/lib/report-text";

// GET /incident/<id>/export?format=md|slack|discord|json|txt[&download=1]
// Text renderings of the committed report JSON, for pasting into Slack / Discord / a GitHub issue /
// email. `download=1` adds a content-disposition so the browser saves the file.
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ advisory: string }> }) {
  const { advisory } = await ctx.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "md") as Format;
  if (!FORMATS.includes(format)) return new Response(`format must be one of ${FORMATS.join(", ")}`, { status: 400 });
  const inc = await readIncident(advisory);
  if (!inc) return new Response("not found", { status: 404 });
  const headers: Record<string, string> = { "content-type": MIME[format], "cache-control": "public, max-age=60" };
  if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename=reachable-${inc.advisory.key}.${format === "slack" || format === "discord" ? "txt" : format}`;
  return new Response(render(inc, format, url.origin), { headers });
}
