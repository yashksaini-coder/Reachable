import { promises as fs } from "node:fs";
import path from "node:path";

// Guide figures live with the docs (docs/assets/guide/*) so GitHub and the app share them; this
// route serves them without duplicating files into public/. Only png/gif/webp/svg names, no paths.
const TYPES: Record<string, string> = { png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg" };

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[A-Za-z0-9._-]+$/.test(file)) return new Response("not found", { status: 404 });
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (!type) return new Response("not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.resolve(process.cwd(), "..", "docs", "assets", "guide", file));
    return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
