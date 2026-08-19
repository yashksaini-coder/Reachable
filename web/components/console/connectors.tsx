"use client";

import { Check, SquareTerminal } from "lucide-react";
import { CARD, Copy, HEAD, PRE } from "@/app/(console)/keys/key-minter";
import { CLAUDE_ADD, CLIENTS, mcpConfig } from "@/lib/mcp";

// The clients that speak this server's stdio contract. Tiles are typographic rather than vendor
// marks: the repo carries no third-party logos, lucide dropped its brand set, and redrawing
// trademarked marks is a question this project has no answer for.
//
// Only Claude Code is marked verified — the twelve tools were actually driven through it against
// the deployed worker. The rest take the identical command, args and env, which is a reason to
// expect them to work and not the same as having run them.

export function Connectors({ apiUrl, token }: { apiUrl: string; token?: string }) {
  const config = mcpConfig({ apiUrl, token });

  return (
    <section className={CARD}>
      <div className={HEAD}>
        <span className="label">connect a coding agent</span>
        <span className="font-mono text-[12px] text-dim">{token ? "config includes your key" : "generate a key first"}</span>
      </div>

      {/* cell-lines, not gap-px on a painted container: five cards in a three-up grid leave a gap,
          and a painted container renders that gap as a phantom sixth card. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] max-[600px]:grid-cols-1">
        {CLIENTS.map((c) => (
          <div key={c.id} className="cell-lines flex min-w-0 flex-col gap-2 p-[18px]">
            <span className="grid size-9 place-items-center rounded-lg border border-border bg-card2 text-mut">
              <SquareTerminal className="size-[17px]" aria-hidden />
            </span>
            <span className="truncate font-mono text-[13px] leading-none text-fg" title={c.name}>
              {c.name}
            </span>
            {c.verified ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] leading-none text-l0">
                <Check className="size-3" aria-hidden /> verified here
              </span>
            ) : (
              <span className="text-[11.5px] leading-none text-dim">same command and args</span>
            )}
            <span className="text-[12px] leading-[1.5] text-dim [overflow-wrap:anywhere]">{c.where}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 border-t border-line p-[18px]">
        <div>
          <div className="label mb-2 flex items-center justify-between gap-3">
            <span>the config — identical for every client</span>
            <Copy text={config} label="copy config" />
          </div>
          <pre className={PRE}>{config}</pre>
        </div>
        <div>
          <div className="label mb-2 flex items-center justify-between gap-3">
            <span>or, for Claude Code, one command</span>
            <Copy text={CLAUDE_ADD} label="copy command" />
          </div>
          <pre className={PRE}>{CLAUDE_ADD}</pre>
        </div>
        <p className="text-[12.5px] leading-[1.6] text-dim">
          Paths are relative, so start the client from the repository root. The virtualenv is needed only for{" "}
          <span className="font-mono text-[12px] text-signal-2">mcp</span> and{" "}
          <span className="font-mono text-[12px] text-signal-2">httpx</span> — no graph driver, no HydraDB in the client.
          All twelve tools answer; eleven read and only <span className="font-mono text-[12px] text-signal-2">watch_repository</span>{" "}
          writes, which a read-only key cannot call.
        </p>
      </div>
    </section>
  );
}
