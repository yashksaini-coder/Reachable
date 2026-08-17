import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, renderDoc } from "@/lib/docs";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";
export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}
export async function generateMetadata({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  const d = DOCS.find((x) => x.slug === slug);
  return { title: d ? `${d.title} · Docs` : "Docs" };
}

// Docs: a 220px page list on the left, the rendered markdown (max 72ch) in the middle, and the
// page's own h2s on the right. Same tokens as the rest of the console; prose styles live in
// globals.css under `.doc`.
export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  const doc = await renderDoc(slug);
  if (!doc) notFound();
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[200px_minmax(0,1fr)_180px] gap-12 px-10 py-10 pb-[72px] max-[1180px]:grid-cols-[200px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:gap-8 max-[900px]:px-5 max-[900px]:pt-6">
      <nav aria-label="Docs" className="min-w-0">
        <div className="label mb-3">guide</div>
        <ul className="flex flex-col gap-0.5 max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:gap-1">
          {DOCS.map((d) => {
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
                  <span className={cn("text-[12.5px] font-medium leading-[1.35]", active ? "text-fg" : "text-mut")}>{d.title}</span>
                  <span className="text-[11px] leading-[1.35] text-dim">{d.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 font-mono text-[10.5px] leading-[1.6] text-dim max-[900px]:mt-3">
          rendered from the repository&apos;s markdown ·{" "}
          <a href="https://github.com/yashksaini-coder/Reachable/tree/master/docs" target="_blank" rel="noreferrer">
            docs/
          </a>
        </p>
      </nav>
      <article className="doc min-w-0">
        <h1 className="text-balance text-[26px] font-medium leading-[1.2] tracking-[-0.02em]">{doc.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
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
