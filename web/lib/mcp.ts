// One generator for the client config; .mcp.json and docs/console/run.md are the other two copies.

export type Client = {
  id: string;
  name: string;
  /** Where the reader puts it, only where the repo actually documents it. */
  where: string;
  /** True only for a client the twelve tools have actually been driven through. */
  verified?: boolean;
};

// The five the repo names, in its order. No config paths beyond Claude Code's — nothing documents
// where the others keep theirs, and inventing one is worse than saying so.
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

/** Claude Code's one-liner. The env matters: `reachable` is not an installed package, so without
 *  PYTHONPATH the server dies with "No module named reachable". */
export function claudeAdd({ apiUrl, token }: { apiUrl: string; token?: string }): string {
  const key = token ?? "<generate one above>";
  return `claude mcp add reachable -e PYTHONPATH=worker -e REACHABLE_API_URL=${apiUrl} -e REACHABLE_API_KEY=${key} -- .venv/bin/python -m reachable.mcp_server`;
}
