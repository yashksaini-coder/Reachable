// One generator for the MCP client config. The same command/args/env is otherwise written in
// .mcp.json and docs/console/run.md; this keeps the UI from becoming a fourth copy that drifts.

export type Client = {
  id: string;
  name: string;
  /** Where the reader puts it, only where the repo actually documents it. */
  where: string;
  /** True only for a client the twelve tools have actually been driven through. */
  verified?: boolean;
};

// The five the repo names, in the order it names them (mcp_server.py, run.md, README.md).
// No per-client config paths beyond Claude Code's: nothing in this repo documents where Codex,
// OpenCode, Cursor or Copilot keep their MCP config, and inventing a path is worse than saying so.
export const CLIENTS: Client[] = [
  { id: "claude-code", name: "Claude Code", where: "the repo's .mcp.json — picked up automatically", verified: true },
  { id: "codex", name: "Codex", where: "wherever your client keeps its MCP servers" },
  { id: "opencode", name: "OpenCode", where: "wherever your client keeps its MCP servers" },
  { id: "cursor", name: "Cursor", where: "wherever your client keeps its MCP servers" },
  { id: "copilot", name: "Copilot", where: "wherever your client keeps its MCP servers" },
];

/** The config block, with a real token when one has just been minted and a placeholder otherwise. */
export function mcpConfig({ apiUrl, token }: { apiUrl: string; token?: string }): string {
  return JSON.stringify(
    {
      mcpServers: {
        reachable: {
          command: ".venv/bin/python",
          args: ["-m", "reachable.mcp_server"],
          env: {
            PYTHONPATH: "worker",
            REACHABLE_API_URL: apiUrl,
            REACHABLE_API_KEY: token ?? "<generate one above>",
          },
        },
      },
    },
    null,
    2,
  );
}

/** The one CLI registration the repo documents (mcp_server.py:7). */
export const CLAUDE_ADD = "claude mcp add reachable -- .venv/bin/python -m reachable.mcp_server";
