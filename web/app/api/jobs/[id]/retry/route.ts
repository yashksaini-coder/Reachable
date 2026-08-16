import { retryJob } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_.:-]+$/.test(id)) return Response.json({ error: "bad job id" }, { status: 400 });
  try {
    const { status, body } = await retryJob(id);
    return Response.json(body, { status });
  } catch {
    return Response.json({ error: "live API unavailable" }, { status: 502 });
  }
}
