import { mintKey, revokeKey } from "@/lib/api";

// Minting is open at the worker on purpose — the key it returns is read-only, expiring and
// rate-limited. This proxy adds nothing but the hop, so the worker's own rate limit is the control.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  const { status, body: res } = await mintKey(name);
  return Response.json(res, { status });
}

// Revoking takes the key itself as the bearer: holding it is the proof of ownership, so the proxy
// forwards the caller's token rather than substituting the operator's.
export async function DELETE(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if (!token) return Response.json({ error: "no key supplied" }, { status: 400 });
  const { status, body } = await revokeKey(token);
  return Response.json(body, { status });
}
