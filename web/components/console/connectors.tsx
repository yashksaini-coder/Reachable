"use client";

import { Bot, Braces, Check, type LucideIcon, MousePointerClick, Terminal } from "lucide-react";
import { CARD, HEAD, PRE } from "@/app/(console)/keys/key-minter";
import { Copy } from "@/components/console/copy";
import { CLIENTS, claudeAdd, mcpConfig } from "@/lib/mcp";
import { cn } from "@/lib/utils";

// Original marks, not vendor logos — the repo carries no third-party trademarks and redrawing them
// raises questions it does not need. Only Claude Code says verified, because it is the one that was.
const MARK: Record<string, { Icon: LucideIcon; plate: string }> = {
  "claude-code": { Icon: Terminal, plate: "rounded-lg border-signal/30 bg-sigfill text-signal-2" },
  codex: { Icon: Bot, plate: "rounded-full border-border bg-card2 text-fg" },
  opencode: { Icon: Braces, plate: "rounded-md border-dashed border-input bg-code text-mut" },
  cursor: { Icon: MousePointerClick, plate: "rounded-[14px_4px_14px_4px] border-border bg-card2 text-fg" },
};

export function Connectors({ endpoint, token }: { endpoint: string; token?: string }) {
  const config = mcpConfig({ endpoint, token });
  const oneLiner = claudeAdd({ endpoint, token });
  const url = endpoint;

  return (
    <section className={CARD}>
      <div className={HEAD}>
        <span className="label">connect a coding agent</span>
        <span className="font-mono text-[12px] text-dim">{token ? "config includes your key" : "generate a key first"}</span>
      </div>

      {/* a row, not a grid: the tiles keep a min width so a narrow viewport lets the last one peek,
          and that peek is the scroll affordance */}
      <div className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:thin] max-[600px]:flex-col">
        {CLIENTS.map((c) => {
          const { Icon, plate } = MARK[c.id] ?? { Icon: Terminal, plate: "rounded-lg border-border bg-card2 text-mut" };
          return (
            <div
              key={c.id}
              className="cell-lines group flex min-w-[178px] flex-1 shrink-0 snap-start flex-col gap-3 p-[18px] transition-colors duration-[180ms] ease-[var(--ease)] hover:bg-hover max-[600px]:flex-row max-[600px]:items-center max-[600px]:gap-3.5"
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center border transition-transform duration-[180ms] ease-[var(--ease)] group-hover:-translate-y-px",
                  plate,
                )}
              >
                <Icon className="size-[17px]" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-[13px] leading-none text-fg" title={c.name}>
                    {c.name}
                  </span>
                  {c.verified ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card2 px-2 py-1 text-[10.5px] leading-none text-mut">
                      <Check className="size-3" aria-hidden /> verified
                    </span>
                  ) : null}
                </span>
                <span className="text-[12px] leading-[1.45] text-mut [overflow-wrap:anywhere]">{c.how}</span>
                <span className="truncate font-mono text-[11.5px] leading-none text-dim" title={url}>
                  {url.replace(/^https?:\/\//, "")}
                </span>
                <span className="text-[11.5px] leading-[1.45] text-dim">{c.where}</span>
              </div>
            </div>
          );
        })}
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
            <Copy text={oneLiner} label="copy command" />
          </div>
          <pre className={PRE}>{oneLiner}</pre>
        </div>
        <p className="text-[12.5px] leading-[1.6] text-dim">
          Nothing to clone and nothing to install — the client opens an HTTP connection to{" "}
          <span className="font-mono text-[12px] text-signal-2">/mcp</span> and sends your key on every call, so the graph,
          the driver and HydraDB all stay on this side. All twelve tools answer; eleven read and only{" "}
          <span className="font-mono text-[12px] text-signal-2">watch_repository</span> writes, which a read-only key cannot
          call.
        </p>
      </div>
    </section>
  );
}
