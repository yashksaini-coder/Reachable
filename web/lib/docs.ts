import "server-only";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { readIncident } from "@/lib/incident";

// In-app guide = the repo's own markdown (docs/console/*.md + docs/schema.md), rendered at build
// time. One source of truth: the same files a reader sees on GitHub. Four markers let a page carry
// diagrams, real numbers and executed statements without typing any of them by hand:
//   {{diagram:NAME}}          → components/docs/diagrams/<NAME>.tsx (inline SVG, server component)
//   {{stat:PATH[|fmt]}}       → a value from worker/out/<GUIDE_INCIDENT>.json (fmt: ms | int | s)
//   {{cypher:SECTION}}        → the executed statement(s) of that section as <pre>
//   {{figure:FILE|caption}}   → docs/assets/guide/FILE, or the caption in a dashed slot if missing
export const GUIDE_INCIDENT = "MAL-2025-46974";

export type DocEntry = { slug: string; title: string; hint: string; file: string; section: "guide" | "reference" };
export const DOCS: readonly DocEntry[] = [
  { slug: "why", title: "Why a graph", hint: "the six questions, and why they are walks", file: "docs/console/why.md", section: "guide" },
  { slug: "how-it-works", title: "How it works", hint: "pipeline, model, each question in-engine", file: "docs/console/how-it-works.md", section: "guide" },
  { slug: "using", title: "Using it", hint: "add a repository, read a report, ask, export", file: "docs/console/using.md", section: "guide" },
  { slug: "reference/schema", title: "Graph schema", hint: "nodes, edges, ids, the window", file: "docs/schema.md", section: "reference" },
  { slug: "reference/ask", title: "Ask grammar", hint: "what the typed questions run", file: "docs/console/ask.md", section: "reference" },
  { slug: "reference/run", title: "Running it", hint: "make targets, ports, badge, MCP", file: "docs/console/run.md", section: "reference" },
  { slug: "reference/data", title: "Data & limits", hint: "sources, windows, stated caps", file: "docs/console/data.md", section: "reference" },
] as const;

const ROOT = path.resolve(process.cwd(), "..");

export type Marker =
  | { kind: "code"; lang: string; text: string }
  | { kind: "diagram"; name: string }
  | { kind: "cypher"; section: string; statements: string[] }
  | { kind: "figure"; file: string; caption: string; exists: boolean; kindOf: "gif" | "png" | "other" };
export type Rendered = { title: string; parts: (string | Marker)[]; headings: { id: string; text: string }[] };

const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(2)} ms`);

function get(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((o, k) => (o != null && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export async function renderDoc(slug: string): Promise<Rendered | null> {
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) return null;
  let md: string;
  try {
    md = await fs.readFile(path.join(ROOT, doc.file), "utf8");
  } catch {
    return null;
  }
  const inc = await readIncident(GUIDE_INCIDENT).catch(() => null);

  // {{stat:…}} inline: substitute before markdown so it flows with the text.
  md = md.replace(/\{\{stat:([a-zA-Z0-9_.]+)(?:\|(ms|int|s))?\}\}/g, (_m, p: string, fmt?: string) => {
    const v = inc ? get(inc, p) : undefined;
    if (v == null || (typeof v === "number" && Number.isNaN(v))) return "— not computed";
    if (typeof v === "number") {
      if (fmt === "ms") return fmtMs(v);
      if (fmt === "s") return `${(v / 1000).toFixed(1)} s`;
      return v.toLocaleString("en-US");
    }
    return String(v);
  });

  // Block markers: pull them out, render markdown around them, then interleave React parts.
  const blocks: Marker[] = [];

  // Fenced code goes the same way. marked would emit <pre><code class="language-x"> into
  // dangerouslySetInnerHTML, where a copy button cannot be wired — as a marker it is real React.
  md = md.replace(/^```([a-zA-Z0-9_-]*)\n([\s\S]*?)^```\s*$/gm, (_m, lang: string, body: string) => {
    blocks.push({ kind: "code", lang: (lang || "text").toLowerCase(), text: body.replace(/\n$/, "") });
    return `\n\n<!--MARKER:${blocks.length - 1}-->\n\n`;
  });
  md = md.replace(/^\{\{(diagram|cypher|figure):([^}]+)\}\}\s*$/gm, (_m, kind: string, arg: string) => {
    let marker: Marker;
    if (kind === "diagram") marker = { kind: "diagram", name: arg.trim() };
    else if (kind === "cypher") {
      const [sec, sub] = arg.trim().split(".");
      const raw = inc ? get(inc, sub ? `${sec}.${sub}` : sec) : undefined;
      const statements = raw && typeof raw === "object" && Array.isArray((raw as { cypher?: unknown }).cypher) ? ((raw as { cypher: string[] }).cypher ?? []) : [];
      marker = { kind: "cypher", section: arg.trim(), statements: [...new Set(statements)] };
    } else {
      const [file, ...cap] = arg.split("|");
      const f = file.trim();
      const exists = existsSync(path.join(ROOT, "docs", "assets", "guide", f));
      marker = { kind: "figure", file: f, caption: cap.join("|").trim(), exists, kindOf: f.endsWith(".gif") ? "gif" : f.endsWith(".png") ? "png" : "other" };
    }
    blocks.push(marker);
    return `\n\n<!--MARKER:${blocks.length - 1}-->\n\n`;
  });
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
  renderer.link = ({ href, text }) => {
    const ext = /^https?:/.test(href);
    return `<a href="${href}"${ext ? ' target="_blank" rel="noreferrer"' : ""}>${marked.parseInline(text)}</a>`;
  };
  const html = await marked.parse(md.replace(/^# .*\n/, ""), { renderer, gfm: true, breaks: false });
  const parts: (string | Marker)[] = [];
  html.split(/<!--MARKER:(\d+)-->/).forEach((chunk, i) => {
    if (i % 2 === 0) {
      if (chunk.trim()) parts.push(chunk);
    } else parts.push(blocks[Number(chunk)]);
  });
  return { title: doc.title, parts, headings };
}
