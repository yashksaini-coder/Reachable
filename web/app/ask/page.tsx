import Link from "next/link";
import { apiHealthy, live } from "@/lib/api";
import { askToPath, describe, EXAMPLES, parseAsk, type Ask } from "@/lib/ask";
import { fmtMs, fmtUtc, short, svcSlug } from "@/lib/incident";
import { Chip, HydraCard, Limits } from "@/app/ui";
import { AskBar } from "./askbar";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { q } = await searchParams;
  const raw = typeof q === "string" ? q : "";
  const healthy = await apiHealthy();
  const parsed = raw ? parseAsk(raw) : null;
  const ask = parsed && !("error" in parsed) ? (parsed as Ask) : null;
  const res = ask ? await live<{ rows: Row[] }>(askToPath(ask).path, askToPath(ask).params) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Ask the graph</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Typed questions map to verified traversals; the exact statement runs live inside HydraDB and is shown under the answer.
        </p>
        <div className="mt-3 md:hidden">
          <AskBar initial={raw} />
        </div>
      </header>

      {!healthy && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
          <Chip tone="mr-2 border-unknown/40 text-unknown">live API unavailable</Chip>
          This deployment renders committed incident data only. Live questions need the local worker (<code>make api</code>) next
          to a running HydraDB node — the incident pages still work.
        </div>
      )}

      {!raw && (
        <section>
          <div className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">Try</div>
          <div className="grid gap-2 md:grid-cols-2">
            {EXAMPLES.map((e) => (
              <Link key={e.q} href={`/ask?q=${encodeURIComponent(e.q)}`} className="rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-signal/50">
                <div className="font-mono text-[12.5px] text-foreground">{e.q}</div>
                <div className="text-[11px] text-muted-foreground">{e.hint}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {parsed && "error" in parsed && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
          <div className="mb-1 font-mono text-muted-foreground">“{raw}”</div>
          {parsed.error}
        </div>
      )}

      {ask && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[15px] font-medium">{describe(ask)}</h2>
            <Chip>{ask.kind}</Chip>
            {res?.ok && <span className="num text-[11px] text-muted-foreground">{fmtMs(res.data?.total_ms ?? res.data?.ms)}</span>}
          </div>
          {res && !res.ok && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px]">
              <Chip tone="mr-2 border-l2/40 text-l2">no answer</Chip>
              <span className="text-muted-foreground">{res.error}</span>
            </div>
          )}
          {res?.ok && res.data && <Answer ask={ask} data={res.data} />}
          {res?.ok && res.data && (
            <>
              <HydraCard title={describe(ask)} cypher={res.data.cypher ?? []} ms={res.data.ms ?? 0} rows={(res.data.rows ?? []).length} />
              <Limits items={res.data.limitations ?? []} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Answer({ ask, data }: { ask: Ask; data: { rows?: Row[]; meta?: Record<string, unknown> } & Record<string, unknown> }) {
  const rows = (data.rows ?? []) as Row[];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
        <Chip tone="mr-2 border-l0/40 text-l0">none</Chip>
        Nothing in the graph matches. For an advisory this means no watched service resolved an affected version; for a package it means no watched lockfile pins it.
      </div>
    );
  }
  switch (ask.kind) {
    case "exposed":
    case "depends":
      return (
        <table className="w-full text-[13px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
          <thead>
            <tr>
              <th>service</th>
              <th>lockfile</th>
              <th>committed</th>
              <th>via</th>
              <th>hops</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-mono">{svcSlug(String(r.service))}</td>
                <td className="font-mono text-muted-foreground">{String(r.sha).slice(0, 12)}</td>
                <td className="font-mono text-muted-foreground">{fmtUtc(new Date(Number(r.committed_at) * 1000).toISOString())}</td>
                <td className="font-mono text-muted-foreground">{r.via ? short(String(r.via)) : "direct"}</td>
                <td className="num">{String(r.hops ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "pulls":
      return (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="font-mono text-[12px] text-muted-foreground">
                {String(r.sha).slice(0, 12)} · {fmtUtc(new Date(Number(r.committed_at) * 1000).toISOString())} · resolves {short(String(r.version))}
              </div>
              {((r.paths as { chain: string[]; hops: number }[] | undefined) ?? []).map((p, j) => (
                <div key={j} className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[12px]">
                  {p.chain.map((el, k) =>
                    k % 2 === 0 ? (
                      <span key={k} className={`rounded px-1.5 py-0.5 ${k === 0 ? "bg-l2/15 text-l2" : "bg-secondary text-muted-foreground"}`}>
                        {short(el)}
                      </span>
                    ) : (
                      <span key={k} className="text-muted-foreground">
                        ←{el}←
                      </span>
                    ),
                  )}
                  <span className="text-muted-foreground">{p.hops === 0 ? "direct" : `${p.hops} hop${p.hops === 1 ? "" : "s"}`}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case "while-live":
      return (
        <table className="w-full text-[13px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
          <thead>
            <tr>
              <th>service</th>
              <th>committed</th>
              <th>version</th>
              <th>evidence</th>
              <th>window</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-mono">{svcSlug(String(r.service))}</td>
                <td className="font-mono text-muted-foreground">{fmtUtc(new Date(Number(r.resolved_at) * 1000).toISOString())}</td>
                <td className="font-mono text-muted-foreground">{short(String(r.version))}</td>
                <td className="text-[12px]">
                  <span className={String(r.evidence).includes("in_window") ? "text-l1" : "text-l2"}>{String(r.evidence).replace("+", " + ")}</span>
                </td>
                <td className="font-mono text-[11px] text-muted-foreground">
                  {fmtUtc(new Date(Number(r.live_from) * 1000).toISOString())} → {fmtUtc(new Date(Number(r.live_to) * 1000).toISOString())} ({String(r.live_to_kind)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "versions":
      return (
        <table className="w-full text-[13px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
          <thead>
            <tr>
              <th>version</th>
              <th>published</th>
              <th>removed</th>
              <th>window</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-mono">{short(String(r.version))}</td>
                <td className="font-mono text-muted-foreground">{fmtUtc(new Date(Number(r.published_at) * 1000).toISOString())}</td>
                <td>{r.removed ? <span className="text-l2">yes</span> : <span className="text-muted-foreground">no</span>}</td>
                <td className="font-mono text-[11px] text-muted-foreground">{String(r.live_to_kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "maintainers":
      return (
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {((data.meta?.maintainers as { login: string; twofa: boolean | null }[] | undefined) ?? []).map((m) => (
              <Chip key={m.login}>
                {short(m.login)} · 2FA {m.twofa === null || m.twofa === undefined ? "unknown" : m.twofa ? "on" : "off"}
              </Chip>
            ))}
          </div>
          <table className="w-full text-[13px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <thead>
              <tr>
                <th>co-maintained package</th>
                <th>services resolving it</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((r, i) => (
                <tr key={i}>
                  <td className="font-mono">{short(String(r.package))}</td>
                  <td className="font-mono text-muted-foreground">
                    <span className="num mr-2">{(r.services_at_risk as string[]).length}</span>
                    {(r.services_at_risk as string[]).map(svcSlug).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "typosquats":
      return (
        <div className="flex flex-wrap gap-2">
          {rows.map((r, i) => (
            <Chip key={i}>
              {short(String(r.package))} · {String(r.kind)} · d{String(r.distance)}
            </Chip>
          ))}
        </div>
      );
    case "cypher": {
      const cols = Object.keys(rows[0]);
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <thead>
              <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="font-mono text-muted-foreground">
                      {typeof r[c] === "object" ? JSON.stringify(r[c]).slice(0, 200) : String(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

