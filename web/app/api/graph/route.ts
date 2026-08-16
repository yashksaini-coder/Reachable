import { live } from "@/lib/api";

// Bounded live neighbourhood for the graph view (proxied server-side; token never leaves).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const service = u.searchParams.get("service") ?? "";
  const advisory = u.searchParams.get("advisory") ?? "";
  if (!service && !advisory) return Response.json({ error: "service or advisory required" }, { status: 400 });
  const r = await live("/graph/sample", service ? { service } : { advisory });
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status === 0 ? 503 : r.status });
  return Response.json(r.data);
}
