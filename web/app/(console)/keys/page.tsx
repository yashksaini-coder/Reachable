import Link from "next/link";
import { apiHealthy } from "@/lib/api";
import { StateView } from "@/components/console/states";
import { mcpUrl } from "@/lib/mcp";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "MCP — keys and connectors" };

export default async function KeysPage() {
  const healthy = await apiHealthy();
  // The browser needs the public API URL to write a usable MCP config; it is not a secret — the key is.
  const apiUrl = process.env.REACHABLE_API_URL ?? "http://127.0.0.1:8787";
  const endpoint = mcpUrl(apiUrl, process.env.REACHABLE_MCP_URL);

  return (
    <div className="mx-auto max-w-[880px] px-10 py-[52px] max-[900px]:px-5">
      <h1 className="m-0 text-[30px] font-medium leading-[1.15] tracking-[-0.02em] text-fg">MCP</h1>
      <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.7] text-mut">
        Ask the graph from a coding agent. Running the worker yourself needs no key at all — this page is for
        querying <span className="font-mono text-[13px] text-signal-2">{apiUrl}</span>, the worker behind this console.{" "}
        <Link href="/docs/reference/run" className="text-fg underline decoration-line underline-offset-4 hover:decoration-mut">
          How to point a client at it
        </Link>
        .
      </p>

      <div className="mt-7">
        {healthy ? (
          <Dashboard endpoint={endpoint} />
        ) : (
          <StateView
            sentence="Key generation needs the live graph, which is not reachable right now."
            hint="nothing here is served from cache · reload to try again"
          />
        )}
      </div>
    </div>
  );
}
