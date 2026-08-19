// One generator for the hosted client config. The repo's .mcp.json is a different thing — the
// stdio server, for contributors running their own worker — so the two are not copies of each other.

export type Client = {
  id: string;
  name: string;
  /** One short line on how this client takes it. */
  how: string;
  /** Where the reader puts it, only where the repo actually documents it. */
  where: string;
  /** True only for a client the twelve tools have actually been driven through. */
  verified?: boolean;
};

// The five the repo names, in its order. Nothing documents where a client keeps its MCP servers
// beyond Claude Code's one command, and inventing a path is worse than saying so.
export const CLIENTS: Client[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    how: "claude mcp add --transport http",
    where: "one command — nothing to clone",
    verified: true,
  },
  { id: "codex", name: "Codex", how: "add it as an HTTP MCP server", where: "wherever your client keeps its MCP servers" },
  { id: "opencode", name: "OpenCode", how: "add it as an HTTP MCP server", where: "wherever your client keeps its MCP servers" },
  { id: "cursor", name: "Cursor", how: "add it as an HTTP MCP server", where: "wherever your client keeps its MCP servers" },
  { id: "copilot", name: "Copilot", how: "add it as an HTTP MCP server", where: "wherever your client keeps its MCP servers" },
];

/** Where clients connect. Caddy merges /mcp onto the API host in production; a local worker runs it
 *  on its own port, so REACHABLE_MCP_URL overrides. */
export function mcpUrl(apiUrl: string, override?: string): string {
  return (override ?? `${apiUrl.replace(/\/+$/, "")}/mcp`).replace(/\/+$/, "");
}

/** The config block, with a real token when one has just been minted and a placeholder otherwise. */
export function mcpConfig({ endpoint, token }: { endpoint: string; token?: string }): string {
  return JSON.stringify(
    {
      mcpServers: {
        reachable: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${token ?? "<generate one above>"}` },
        },
      },
    },
    null,
    2,
  );
}

/** Claude Code's one-liner — the same URL and key, no repository and no interpreter. */
export function claudeAdd({ endpoint, token }: { endpoint: string; token?: string }): string {
  const key = token ?? "<generate one above>";
  return `claude mcp add --transport http reachable ${endpoint} --header "Authorization: Bearer ${key}"`;
}
