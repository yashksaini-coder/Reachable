import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, renderDoc, type Marker } from "@/lib/docs";
import { DIAGRAMS, Missing } from "@/components/docs/diagrams";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";
export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug.split("/") }));
}
export async function generateMetadata({ params }: PageProps<"/docs/[...slug]">) {
  const { slug } = await params;
  const d = DOCS.find((x) => x.slug === slug.join("/"));
  return { title: d ? `${d.title} · Guide` : "Guide" };
}

// The guide: chapters (why · how it works · using it) then reference pages. Left: the page list in
// two groups; middle: the article (72ch) with diagrams / statements / figures interleaved; right:
// the page's own h2s. Prose styles live in globals.css under `.doc`.
export default async function DocPage({ params }: PageProps<"/docs/[...slug]">) {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const doc = await renderDoc(slug);
  if (!doc) notFound();
  const groups = [
    { key: "guide", label: "guide", items: DOCS.filter((d) => d.section === "guide") },
    { key: "reference", label: "reference", items: DOCS.filter((d) => d.section === "reference") },
  ];
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[200px_minmax(0,1fr)_180px] gap-12 px-10 py-10 pb-[72px] max-[1180px]:grid-cols-[200px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:gap-8 max-[900px]:px-5 max-[900px]:pt-6">
      <nav aria-label="Guide" className="min-w-0 max-[900px]:order-first">
        {groups.map((g) => (
          <div key={g.key} className="mb-6">
            <div className="label mb-3">{g.label}</div>
            <ul className="flex flex-col gap-0.5 max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:gap-1">
              {g.items.map((d) => {
                const active = d.slug === slug;
                return (
                  <li key={d.slug} className="min-w-0">
                    <Link
                      href={`/docs/${d.slug}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 flex-col justify-center rounded-lg border-l-2 px-3 transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover max-[900px]:border-l-0 max-[900px]:border-b-2 max-[900px]:rounded-b-none max-[900px]:py-1.5",
                        active ? "border-signal" : "border-transparent",
                      )}
                    >
                      <span className={cn("truncate text-[12.5px] font-medium leading-[1.35]", active ? "text-fg" : "text-mut")}>{d.title}</span>
                      <span className="truncate text-[11px] leading-[1.35] text-dim max-[900px]:hidden">{d.hint}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <p className="font-mono text-[10.5px] leading-[1.6] text-dim max-[900px]:hidden">
          rendered from the repository&apos;s markdown ·{" "}
          <a href="https://github.com/yashksaini-coder/Reachable/tree/master/docs" target="_blank" rel="noreferrer">
            docs/
          </a>
        </p>
      </nav>
      <article className="doc min-w-0">
        <h1 className="text-balance text-[26px] font-medium leading-[1.2] tracking-[-0.02em]">{doc.title}</h1>
        {doc.parts.map((p, i) => (typeof p === "string" ? <div key={i} dangerouslySetInnerHTML={{ __html: p }} /> : <Block key={i} m={p} />))}
      </article>
      <aside className="max-[1180px]:hidden">
        {doc.headings.length > 0 && (
          <div className="sticky top-[76px]">
            <div className="label mb-3">on this page</div>
            <ul className="flex flex-col gap-1.5">
              {doc.headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="block text-[11.5px] leading-[1.4] text-mut transition-colors duration-[180ms] hover:text-fg">
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

// One interleaved block: a diagram, the executed statement(s) of a report section, or a figure.
function Block({ m }: { m: Marker }) {
  if (m.kind === "diagram") {
    const D = DIAGRAMS[m.name];
    return (
      <figure className="my-5 overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card p-4 [scrollbar-width:thin]">
        {D ? <D /> : <Missing name={m.name} />}
      </figure>
    );
  }
  if (m.kind === "cypher") {
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-border border-l-2 border-l-signal/55 bg-card2">
        <div className="flex min-h-10 items-center gap-3 px-[13px]">
          <span className="rounded-xs bg-sigfill px-1.5 py-[5px] font-mono text-[10.5px] font-medium uppercase leading-none tracking-[0.1em] text-signal">hydradb</span>
          <span className="font-mono text-[11px] text-dim">executed statement · {m.section}</span>
        </div>
        {m.statements.length === 0 ? (
          <div className="mx-[13px] mb-[13px] rounded-md border border-line bg-code p-3 font-mono text-[11.5px] text-dim">— not computed</div>
        ) : (
          <pre className="mx-[13px] mb-[13px] mt-0 overflow-x-auto rounded-md border border-line bg-code p-3 font-mono text-[11.5px] leading-[1.65] text-signal-2">
            {m.statements.join("\n\n")}
          </pre>
        )}
      </div>
    );
  }
  // figure
  return (
    <figure className="my-5">
      {m.exists ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/guide/${m.file}`} alt={m.caption} className={cn("mx-auto block max-h-[400px] w-auto max-w-full rounded-xl border border-border", m.kindOf === "png" && "pixel")} loading="lazy" />
      ) : (
        <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-input px-6 text-center font-mono text-[11px] leading-[1.6] text-dim">
          {m.caption} — <span className="ml-1">{m.file} not added yet</span>
        </div>
      )}
      {m.exists && <figcaption className="mt-2 font-mono text-[11px] leading-[1.6] text-dim">{m.caption}</figcaption>}
    </figure>
  );
}
