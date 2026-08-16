import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";

// In-app docs are the repo's own markdown (docs/console/*.md + docs/schema.md), rendered at build
// time. One source of truth: the same files a reader sees on GitHub.
export const DOCS = [
  { slug: "overview", title: "Overview", hint: "six questions, four verdicts", file: "docs/console/overview.md" },
  { slug: "pages", title: "The console", hint: "what each page shows", file: "docs/console/pages.md" },
  { slug: "ask", title: "Ask", hint: "the typed-question grammar", file: "docs/console/ask.md" },
  { slug: "data", title: "Data and honesty", hint: "sources, windows, stated caps", file: "docs/console/data.md" },
  { slug: "schema", title: "Graph schema", hint: "nodes, edges, ids, the window", file: "docs/schema.md" },
  { slug: "run", title: "Running it", hint: "make targets, ports, badge, MCP", file: "docs/console/run.md" },
] as const;
export type DocSlug = (typeof DOCS)[number]["slug"];

const ROOT = path.resolve(process.cwd(), "..");

export async function renderDoc(slug: string): Promise<{ title: string; html: string; headings: { id: string; text: string }[] } | null> {
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) return null;
  let md: string;
  try {
    md = await fs.readFile(path.join(ROOT, doc.file), "utf8");
  } catch {
    return null;
  }
  const headings: { id: string; text: string }[] = [];
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[`*_]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  const renderer = new marked.Renderer();
  renderer.heading = ({ text, depth }) => {
    const id = slugify(text);
    if (depth === 2) headings.push({ id, text: text.replace(/`/g, "") });
    return `<h${depth} id="${id}">${marked.parseInline(text)}</h${depth}>`;
  };
  // internal links (/docs/x, /incidents …) stay app-relative; external open in a new tab
  renderer.link = ({ href, text }) => {
    const ext = /^https?:/.test(href);
    return `<a href="${href}"${ext ? ' target="_blank" rel="noreferrer"' : ""}>${marked.parseInline(text)}</a>`;
  };
  const html = await marked.parse(md.replace(/^# .*\n/, ""), { renderer, gfm: true, breaks: false });
  return { title: doc.title, html, headings };
}
