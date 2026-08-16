import { live } from "@/lib/api";
import { askToPath, describe, parseAsk } from "@/lib/ask";

// POST {q} → {ask, describe, data} | {ask?, describe?, error}. Parses the typed question into one
// of the verified shapes and forwards it to the worker API; nothing is computed here.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { q?: unknown };
  const q = typeof body.q === "string" ? body.q : "";
  const parsed = parseAsk(q);
  if ("error" in parsed) return Response.json({ error: parsed.error, q }, { status: 400 });
  const { path, params } = askToPath(parsed);
  const res = await live(path, params);
  const head = { ask: parsed, describe: describe(parsed) };
  if (!res.ok) return Response.json({ ...head, error: res.error }, { status: res.status === 0 ? 503 : res.status });
  return Response.json({ ...head, data: res.data });
}
