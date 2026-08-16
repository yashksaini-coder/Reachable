import { jobs } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await jobs();
  if (list === null) return Response.json({ error: "live API unavailable" }, { status: 502 });
  return Response.json(list);
}
