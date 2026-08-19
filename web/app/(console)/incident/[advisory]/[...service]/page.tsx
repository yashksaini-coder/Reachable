import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileSearch } from "lucide-react";
import { readIncident, listIncidents, short, svcSlug, fmtUtc } from "@/lib/incident";
import { HydraCard, Level, Chip, Notes } from "@/components/console/ui";
import { cn } from "@/lib/utils";
import { Chain } from "./chain";
import { EmptySlot, SCROLLER } from "@/components/console/states";

export const dynamic = "force-static";
export async function generateStaticParams() {
  const out: { advisory: string; service: string[] }[] = [];
  for (const inc of await listIncidents())
    for (const s of inc.q1_exposed.services) out.push({ advisory: inc.advisory.key, service: svcSlug(s).split("/") });
  return out;
}
export async function generateMetadata({ params }: PageProps<"/incident/[advisory]/[...service]">) {
  const { advisory, service } = await params;
  return { title: `${service.map(decodeURIComponent).join("/")} · ${advisory}` };
}

const VERDICT: Record<string, string> = {
  L2: "Act now. First-party code references a vulnerable symbol from the compromised package.",
  L1: "Low risk. First-party code imports the package but does not reference the vulnerable symbol.",
  L0: "Deprioritise. The package is in the install tree but no scanned file imports it.",
  unscanned:
    "Unknown. No source files were ingested for this service, so reachability could not be assessed — this is not a clean bill of health.",
};
const LEVEL_WHY: Record<string, string> = {
  L2: "a scanned first-party file references a symbol the advisory names as vulnerable",
  L1: "a scanned first-party file imports the package, but no vulnerable symbol is referenced",
  L0: "files were scanned and none import the package; it only sits in the install tree",
  unscanned: "no first-party files were ingested, so imports and symbol use could not be checked",
};

const linkCls =
  "inline-flex min-h-10 items-center gap-1 rounded-md text-mut transition-colors duration-[180ms] ease-[var(--ease)] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50";
const CARD = "overflow-hidden rounded-xl border border-border bg-card elev";
const CARD_HEAD = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-[18px] py-3.5";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const hops = (n: number | null) => (n === null ? "— not computed" : n === 0 ? "direct" : plural(n, "hop"));

export default async function ServicePage({ params }: PageProps<"/incident/[advisory]/[...service]">) {
  const { advisory, service } = await params;
  const inc = await readIncident(advisory);
  if (!inc) notFound();
  const slug = service.map(decodeURIComponent).join("/");
  const key = `svc:${slug}`;
  const rows = inc.q1_exposed.rows.filter((r) => r.service === key).sort((a, b) => b.committed_at - a.committed_at);
  if (rows.length === 0) notFound();
  const reach = inc.q7_reachability[key];
  const level = reach?.level ?? "unscanned";
  const live = (inc.q3_while_live?.rows ?? []).filter((r) => r.service === key);
  const nPaths = rows.reduce((n, r) => n + r.paths.length, 0);
  const versions = [...new Set(rows.flatMap((r) => r.bad_versions))];
  const reachNote = reach
    ? `${LEVEL_WHY[level]} · ${plural(reach.files_scanned, "file")} scanned · ${plural(reach.imports.length, "import")} · ${plural(reach.symbols.length, "symbol use")}`
    : `unscanned — ${LEVEL_WHY.unscanned}`;

  return (
    <div className="mx-auto max-w-[1000px] px-10 pb-24 pt-9 max-[900px]:px-5">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-[12px] leading-none text-dim">
        <Link href="/incidents" className={linkCls}>
          incidents
        </Link>
        <span>/</span>
        <Link href={`/incident/${inc.advisory.key}`} className={linkCls}>
          {inc.advisory.key}
        </Link>
        <span>/</span>
        <span className="text-mut">{slug}</span>
      </nav>

      <header className="mt-5 animate-[en_.3s_var(--ease)_both] motion-reduce:animate-none">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-balance font-mono text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-fg">{slug}</h1>
          <Level level={level} />
          <a href={`https://github.com/${slug}`} target="_blank" rel="noreferrer" className={cn(linkCls, "text-[12px]")}>
            github <ExternalLink className="size-3" strokeWidth={1.75} />
          </a>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-x-[22px] gap-y-1.5 font-mono text-[12px] leading-[1.3] text-dim">
          <span>
            lockfiles <span className="num text-mut">{rows.length}</span>
          </span>
          <span>
            latest commit <span className="text-mut">{rows[0].sha.slice(0, 12)}</span>
          </span>
          <span>
            compromised versions <span className="text-mut">{versions.map(short).join(", ")}</span>
          </span>
          {live.length > 0 && (
            <span>
              resolved while live <span className="num text-l1">{live.length}</span>
            </span>
          )}
        </div>
        <p className="mt-[18px] max-w-[70ch] text-pretty text-[15px] leading-[1.6] text-fg">{VERDICT[level]}</p>
      </header>

      {/* one card per exposed lockfile — the proving-path chain is the signature */}
      <div className="mt-7 flex flex-col gap-3">
        {rows.map((r, idx) => (
          <div key={r.lockfile} className={cn(CARD, "animate-[en_.3s_var(--ease)_both] motion-reduce:animate-none")} style={{ animationDelay: `${80 + idx * 60}ms` }}>
            <div className={CARD_HEAD}>
              <span className="flex flex-wrap items-center gap-2 font-mono text-[13px] leading-none text-fg">
                {short(r.lockfile)}
                {live.some((l) => l.lockfile === r.lockfile) && <Chip tone="text-l1">resolved while live</Chip>}
              </span>
              <span className="num font-mono text-[12px] leading-none text-dim">
                {hops(r.hops)} · {r.sha.slice(0, 7)} · {fmtUtc(new Date(r.committed_at * 1000).toISOString())}
              </span>
            </div>
            {r.paths.length === 0 ? (
              <div className="p-[18px] font-mono text-[12px] leading-[1.5] text-dim [overflow-wrap:anywhere]">
                {r.hops === null
                  ? `resolved ${r.bad_versions.map(short).join(", ")} — proof path not computed (past this report\u2019s path budget); membership is exact`
                  : `direct RESOLVED edge to ${r.bad_versions.map(short).join(", ")} (no explanation path requested)`}
              </div>
            ) : (
              /* the chain scrolls inside its card; a fade at the right edge hints there is more */
              <div className="relative">
                <div className={cn(SCROLLER, "p-[18px]")}>
                  <div className="flex min-w-max flex-col gap-2.5 pr-6">
                    {r.paths.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Chain chain={p.chain} />
                        <span className="num shrink-0 font-mono text-[11.5px] text-dim">{hops(p.hops)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-card to-transparent" />
              </div>
            )}
            <div className="px-[18px] pb-[18px] font-mono text-[12px] leading-[1.6] text-dim">
              <span className={cn("mr-1", level === "L2" && "text-l2")}>reachability ·</span>
              {reachNote}
            </div>
          </div>
        ))}
      </div>

      {/* reachability evidence — the scanned files behind the verdict */}
      {reach && (reach.imports.length > 0 || reach.symbols.length > 0 || reach.files_scanned > 0) && (
        <div className={cn(CARD, "mt-3")}>
          <div className={CARD_HEAD}>
            <span className="label">reachability</span>
            <span className="num font-mono text-[12px] leading-none text-dim">
              {plural(reach.files_scanned, "first-party file")} scanned · {plural(reach.imports.length, "import")} · {plural(reach.symbols.length, "symbol use")}
            </span>
          </div>
          <div className="space-y-3 p-[18px]">
            {reach.imports.length > 0 && (
              <div>
                <div className="label mb-1.5">imports</div>
                <ul className="space-y-1 font-mono text-[13px] text-fg [overflow-wrap:anywhere]">
                  {reach.imports.map((i, k) => (
                    <li key={k}>
                      {i.path}:{i.line} <span className="text-dim">imports {short(i.package)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reach.symbols.length > 0 && (
              <div>
                <div className="label mb-1.5">vulnerable symbols</div>
                <ul className="space-y-1 font-mono text-[13px] text-l2 [overflow-wrap:anywhere]">
                  {reach.symbols.map((s, k) => (
                    <li key={k}>
                      {s.path}:{s.line} uses {s.symbol}
                      {s.inferred && <span className="ml-2 text-dim">(symbol inferred from advisory prose)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reach.imports.length === 0 && reach.symbols.length === 0 && (
              <EmptySlot icon={FileSearch}>no scanned file imports the package</EmptySlot>
            )}
          </div>
        </div>
      )}

      {/* resolved while the version was still installable */}
      {live.length > 0 && (
        <div className={cn(CARD, "mt-3")}>
          <div className={CARD_HEAD}>
            <span className="label">resolved while live</span>
            <span className="num font-mono text-[12px] leading-none text-dim">{plural(live.length, "lockfile")}</span>
          </div>
          <ul className="divide-y divide-line font-mono text-[12.5px]">
            {live.map((l, i) => (
              <li key={i} className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-[18px] py-2.5">
                <span className="text-fg">{l.sha.slice(0, 12)}</span>
                <span className="text-dim">committed {fmtUtc(l.resolved_at_iso)}</span>
                <span className="text-dim">{short(l.version)}</span>
                <Chip tone={l.evidence.includes("in_window") ? "text-l1" : "text-l2"}>{l.evidence.replace("+", " + ")}</Chip>
                <span className="num basis-full text-dim min-[900px]:ml-auto min-[900px]:basis-auto">
                  window {fmtUtc(l.live_from_iso)} → {fmtUtc(l.live_to_iso)} ({l.live_to_kind.replace("_", " ")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <HydraCard flat title="all proving paths from this service to the affected version" cypher={inc.q1_exposed.cypher} ms={inc.q1_exposed.ms} rows={inc.q1_exposed.rows.length} truncated={inc.q1_exposed.truncated} timing={inc.q1_exposed.timing} />
        {reach && <HydraCard flat title="which first-party files import the package or reference the vulnerable symbol?" cypher={reach.cypher} ms={reach.ms} rows={reach.imports.length + reach.symbols.length} />}
        {live.length > 0 && inc.q3_while_live && (
          <HydraCard flat title="which lockfiles resolved the version while it was still installable?" cypher={inc.q3_while_live.cypher} ms={inc.q3_while_live.ms} rows={inc.q3_while_live.rows.length} truncated={inc.q3_while_live.truncated} />
        )}
      </div>
      <Notes items={[...inc.q1_exposed.limitations, ...(reach?.limitations ?? [])]} />
      <div className="mt-2 font-mono text-[11.5px] text-dim">
        {plural(rows.length, "lockfile")} · {plural(nPaths, "proving path")}
      </div>
    </div>
  );
}
