import { live } from "@/lib/api";

// Server-only proxy: GitHub code search for public repos whose lockfile pins an affected version.
// The GitHub token lives with the worker; the browser only ever sees repo slugs.
export const dynamic = "force-dynamic";

const ADV = /^(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|MAL-\d{4}-\d+|CVE-\d{4}-\d+)$/;

export async function GET(req: Request) {
  const advisory = new URL(req.url).searchParams.get("advisory") ?? "";
  if (!ADV.test(advisory)) return Response.json({ error: "bad advisory id" }, { status: 400 });
  const r = await live("/victims", { advisory });
  return Response.json(r.ok ? r.data : { error: r.error }, { status: r.ok ? 200 : r.status || 502 });
}
