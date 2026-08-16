import { services, addService } from "@/lib/api";

// Server-only proxy to the worker (loopback). The browser never sees the worker URL or any token.
export const dynamic = "force-dynamic";

const SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function normaliseRepo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
  s = s.split("/").slice(0, 2).join("/");
  return SLUG.test(s) ? s : null;
}

export async function GET() {
  const list = await services();
  if (list === null) return Response.json({ error: "live API unavailable" }, { status: 502 });
  return Response.json(list);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { repo?: unknown };
  const repo = normaliseRepo(body.repo);
  if (!repo) return Response.json({ error: "expected owner/repo or https://github.com/owner/repo" }, { status: 400 });
  try {
    const { status, body: out } = await addService(repo);
    return Response.json(out, { status });
  } catch {
    return Response.json({ error: "live API unavailable" }, { status: 502 });
  }
}
