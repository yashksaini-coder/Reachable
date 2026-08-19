import { mintKey } from "@/lib/api";

// Minting is open at the worker on purpose — the key it returns is read-only, expiring and
// rate-limited. This proxy adds nothing but the hop, so the worker's own rate limit is the control.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  const { status, body: res } = await mintKey(name);
  return Response.json(res, { status });
}
