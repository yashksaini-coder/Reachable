import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileCode2, GitCommitHorizontal } from "lucide-react";
import { readIncident, listIncidents, short, svcSlug, fmtUtc } from "@/lib/incident";
import { HydraCard, Level, Limits, Chip, ELEV } from "@/app/ui";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-static";
export async function generateStaticParams() {
  const out: { advisory: string; service: string[] }[] = [];
  for (const inc of await listIncidents())
    for (const s of inc.q1_exposed.services) out.push({ advisory: inc.advisory.key, service: svcSlug(s).split("/") });
  return out;
}

const VERDICT: Record<string, string> = {
  L2: "Act now. First-party code references a vulnerable symbol from the compromised package.",
  L1: "Low risk. First-party code imports the package but does not reference the vulnerable symbol.",
  L0: "Deprioritise. The package is in the install tree but no scanned file imports it.",
  unscanned:
    "Unknown. No source files were ingested for this service, so reachability could not be assessed — this is not a clean bill of health.",
};

export default async function ServicePage({ params }: PageProps<"/incident/[advisory]/[...service]">) {
  const { advisory, service } = await params;
  const inc = await readIncident(advisory);
  if (!inc) notFound();
  const slug = service.map(decodeURIComponent).join("/");
  const key = `svc:${slug}`;
  const rows = inc.q1_exposed.rows.filter((r) => r.service === key);
  if (rows.length === 0) notFound();
  const reach = inc.q7_reachability[key];
  const level = reach?.level ?? "unscanned";
  const live = (inc.q3_while_live?.rows ?? []).filter((r) => r.service === key);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <Link href="/" className="inline-flex min-h-10 items-center rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">incidents</Link>
        <span>/</span>
        <Link href={`/incident/${inc.advisory.key}`} className="inline-flex min-h-10 items-center gap-1 rounded-md font-mono transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">
          <ArrowLeft className="size-3.5" /> {inc.advisory.key}
        </Link>
        <span>/</span>
        <span className="font-mono text-foreground">{slug}</span>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl">{slug}</h1>
          <a href={`https://github.com/${slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">
            github <ExternalLink className="size-3" />
          </a>
        </div>
        <Card className={cn("border-l-4", ELEV, level === "L2" ? "border-l-l2" : level === "L1" ? "border-l-l1" : level === "L0" ? "border-l-l0" : "border-l-unknown")}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Level level={level} />
            <span className="text-pretty text-[14px] text-foreground/90">{VERDICT[level]}</span>
          </CardContent>
        </Card>
      </header>

      <section>
        <h2 className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">why this service is exposed</h2>
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.lockfile} className={ELEV}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 text-foreground/90">
                    <GitCommitHorizontal className="size-3.5" /> {r.sha.slice(0, 12)}
                  </span>
                  <span>committed {fmtUtc(new Date(r.committed_at * 1000).toISOString())}</span>
                  <span>resolves {r.bad_versions.map(short).join(", ")}</span>
                  {live.some((l) => l.lockfile === r.lockfile) && <Chip tone="border-l1/40 text-l1">resolved while live</Chip>}
                </div>
                <div className="mt-3 space-y-1.5">
                  {r.paths.length === 0 && <div className="text-xs text-muted-foreground">direct RESOLVED edge (no explanation path requested)</div>}
                  {r.paths.map((p, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1 font-mono text-xs">
                      {p.chain.map((el, j) =>
                        j % 2 === 0 ? (
                          <span
                            key={j}
                            style={{ animationDelay: `${j * 40}ms` }}
                            className={cn(
                              "animate-in fade-in slide-in-from-left-1 fill-mode-backwards rounded-md px-1.5 py-0.5 duration-300",
                              j === 0 ? "bg-l2/15 text-l2" : j === p.chain.length - 1 ? "bg-secondary text-foreground" : "bg-secondary/70 text-muted-foreground",
                            )}
                          >
                            {short(el)}
                          </span>
                        ) : (
                          <span key={j} style={{ animationDelay: `${j * 40}ms` }} className="animate-in fade-in fill-mode-backwards text-muted-foreground duration-300">
                            ←{el}←
                          </span>
                        ),
                      )}
                      <span className="ml-2 text-muted-foreground">{p.hops === 0 ? "direct dependency" : `${p.hops} hop${p.hops === 1 ? "" : "s"}`}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <HydraCard title="proving path" cypher={inc.q1_exposed.cypher} ms={inc.q1_exposed.ms} rows={inc.q1_exposed.rows.length} />
      </section>

      {reach && (
        <section>
          <h2 className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">reachability</h2>
          <Card className={ELEV}>
            <CardContent className="p-4 text-sm">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileCode2 className="size-3.5" /> {reach.files_scanned} first-party files scanned
              </div>
              {reach.imports.length > 0 && (
                <ul className="mt-2 space-y-1 font-mono text-xs">
                  {reach.imports.map((i, k) => (
                    <li key={k}>
                      {i.path}:{i.line} <span className="text-muted-foreground">imports {short(i.package)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {reach.symbols.length > 0 && (
                <ul className="mt-2 space-y-1 font-mono text-xs text-l2">
                  {reach.symbols.map((s, k) => (
                    <li key={k}>
                      {s.path}:{s.line} uses {s.symbol}
                      {s.inferred && <span className="ml-2 text-muted-foreground">(symbol inferred from advisory prose)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <HydraCard title="reachability" cypher={reach.cypher} ms={reach.ms} rows={reach.imports.length + reach.symbols.length} />
          <Limits items={reach.limitations} />
        </section>
      )}

      {live.length > 0 && (
        <section>
          <h2 className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">resolved while live</h2>
          <ul className="space-y-1.5 font-mono text-xs">
            {live.map((l, i) => (
              <li key={i} className={cn("rounded-lg border border-border bg-card px-3 py-2", ELEV)}>
                {l.sha.slice(0, 12)} · committed {fmtUtc(l.resolved_at_iso)} · {short(l.version)} ·{" "}
                <span className={l.evidence.includes("in_window") ? "text-l1" : "text-l2"}>{l.evidence.replace("+", " + ")}</span>
                <span className="text-muted-foreground"> · window {fmtUtc(l.live_from_iso)} → {fmtUtc(l.live_to_iso)} ({l.live_to_kind.replace("_", " ")})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
