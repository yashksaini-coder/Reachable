import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileCode2, GitCommitHorizontal } from "lucide-react";
import { readIncident, listIncidents, short, svcSlug, fmtUtc } from "@/lib/incident";
import { HydraCard, Level, Chip, Notes, Question, ELEV } from "@/components/console/ui";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

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
const RAIL: Record<string, string> = { L2: "border-l-l2", L1: "border-l-l1", L0: "border-l-l0", unscanned: "border-l-unknown" };
const LEVEL_WHY: Record<string, string> = {
  L2: "A scanned first-party file references a symbol the advisory names as vulnerable.",
  L1: "A scanned first-party file imports the package, but no vulnerable symbol is referenced.",
  L0: "Files were scanned and none import the package. It only sits in the install tree.",
  unscanned: "No first-party files were ingested, so imports and symbol use could not be checked.",
};

const linkCls =
  "inline-flex min-h-10 items-center gap-1 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50";

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <Link href="/incidents" className={linkCls}>
          <ArrowLeft className="size-3.5" /> incidents
        </Link>
        <span>/</span>
        <Link href={`/incident/${inc.advisory.key}`} className={cn(linkCls, "font-mono")}>
          {inc.advisory.key}
        </Link>
        <span>/</span>
        <span className="font-mono text-foreground">{slug}</span>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl">{slug}</h1>
          <a href={`https://github.com/${slug}`} target="_blank" rel="noreferrer" className={cn(linkCls, "text-xs text-muted-foreground")}>
            github <ExternalLink className="size-3" />
          </a>
        </div>
        <Card className={cn("border-l-4", ELEV, RAIL[level])}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Level level={level} />
            <span className="text-pretty text-[14px] text-foreground/90">{VERDICT[level]}</span>
            <span className="num basis-full text-xs text-muted-foreground md:ml-auto md:basis-auto">
              {rows.length} lockfile{rows.length === 1 ? "" : "s"} · {versions.length} compromised version{versions.length === 1 ? "" : "s"}
              {live.length > 0 && ` · ${live.length} resolved while live`}
            </span>
          </CardContent>
        </Card>
      </header>

      <Question
        n="1"
        title="Why is this service exposed?"
        summary={`${rows.length} lockfile${rows.length === 1 ? "" : "s"} · ${nPaths} proving path${nPaths === 1 ? "" : "s"}`}
        footer={
          <>
            <HydraCard flat title="proving path" cypher={inc.q1_exposed.cypher} ms={inc.q1_exposed.ms} rows={inc.q1_exposed.rows.length} truncated={inc.q1_exposed.truncated} />
            <Notes items={inc.q1_exposed.limitations} />
          </>
        }
      >
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.lockfile} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-foreground/90">
                  <GitCommitHorizontal className="size-3.5" /> {r.sha.slice(0, 12)}
                </span>
                <span>committed {fmtUtc(new Date(r.committed_at * 1000).toISOString())}</span>
                <span>resolves {r.bad_versions.map(short).join(", ")}</span>
                {live.some((l) => l.lockfile === r.lockfile) && <Chip tone="border-l1/40 text-l1">resolved while live</Chip>}
              </div>
              <div className="mt-2 space-y-1.5">
                {r.paths.length === 0 && <div className="text-xs text-muted-foreground">direct RESOLVED edge (no explanation path requested)</div>}
                {r.paths.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1 font-mono text-xs">
                    {p.chain.map((el, j) =>
                      j % 2 === 0 ? (
                        <span
                          key={j}
                          style={{ animationDelay: `${j * 40}ms` }}
                          className={cn(
                            "animate-in fade-in slide-in-from-left-1 fill-mode-backwards rounded-md px-1.5 py-0.5 duration-300 motion-reduce:animate-none",
                            j === 0 ? "bg-l2/15 text-l2" : j === p.chain.length - 1 ? "bg-secondary text-foreground" : "bg-secondary/70 text-muted-foreground",
                          )}
                        >
                          {short(el)}
                        </span>
                      ) : (
                        <span key={j} style={{ animationDelay: `${j * 40}ms` }} className="animate-in fade-in fill-mode-backwards text-muted-foreground duration-300 motion-reduce:animate-none">
                          ←{el}←
                        </span>
                      ),
                    )}
                    <span className="ml-2 text-muted-foreground">{p.hops === 0 ? "direct dependency" : `${p.hops} hop${p.hops === 1 ? "" : "s"}`}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Question>

      {reach && (
        <Question
          n="2"
          title="Is the compromised code reachable?"
          summary={`${reach.files_scanned} file${reach.files_scanned === 1 ? "" : "s"} · ${reach.imports.length} import${reach.imports.length === 1 ? "" : "s"} · ${reach.symbols.length} symbol use${reach.symbols.length === 1 ? "" : "s"}`}
          footer={
            <>
              <HydraCard flat title="reachability" cypher={reach.cypher} ms={reach.ms} rows={reach.imports.length + reach.symbols.length} />
              <Notes items={reach.limitations} />
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Level level={level} />
            <span className="text-pretty text-sm text-foreground/90">{LEVEL_WHY[level]}</span>
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileCode2 className="size-3.5" /> <span className="num">{reach.files_scanned}</span> first-party files scanned
          </div>
          {reach.imports.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">imports</div>
              <ul className="space-y-1 font-mono text-xs">
                {reach.imports.map((i, k) => (
                  <li key={k}>
                    {i.path}:{i.line} <span className="text-muted-foreground">imports {short(i.package)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reach.symbols.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">vulnerable symbols</div>
              <ul className="space-y-1 font-mono text-xs text-l2">
                {reach.symbols.map((s, k) => (
                  <li key={k}>
                    {s.path}:{s.line} uses {s.symbol}
                    {s.inferred && <span className="ml-2 text-muted-foreground">(symbol inferred from advisory prose)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reach.imports.length === 0 && reach.symbols.length === 0 && reach.files_scanned > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">No scanned file imports the package.</div>
          )}
        </Question>
      )}

      {live.length > 0 && (
        <Question n="3" title="Was it resolved while the version was live?" summary={`${live.length} lockfile${live.length === 1 ? "" : "s"}`}>
          <ul className="divide-y divide-border font-mono text-xs">
            {live.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
                <span className="inline-flex items-center gap-1 text-foreground/90">
                  <GitCommitHorizontal className="size-3.5" /> {l.sha.slice(0, 12)}
                </span>
                <span className="text-muted-foreground">committed {fmtUtc(l.resolved_at_iso)}</span>
                <span className="text-muted-foreground">{short(l.version)}</span>
                <Chip tone={l.evidence.includes("in_window") ? "border-l1/40 text-l1" : "border-l2/40 text-l2"}>{l.evidence.replace("+", " + ")}</Chip>
                <span className="num basis-full text-muted-foreground md:ml-auto md:basis-auto">
                  window {fmtUtc(l.live_from_iso)} → {fmtUtc(l.live_to_iso)} ({l.live_to_kind.replace("_", " ")})
                </span>
              </li>
            ))}
          </ul>
        </Question>
      )}
    </div>
  );
}
