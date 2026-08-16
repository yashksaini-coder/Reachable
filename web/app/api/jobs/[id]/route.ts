import { job } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_.:-]+$/.test(id)) return Response.json({ error: "bad job id" }, { status: 400 });
  try {
    const { status, body } = await job(id);
    return Response.json(body, { status });
  } catch {
    return Response.json({ error: "live API unavailable" }, { status: 502 });
  }
}
