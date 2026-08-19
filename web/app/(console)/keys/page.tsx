import Link from "next/link";
import { apiHealthy } from "@/lib/api";
import { StateView } from "@/components/console/states";
import { KeyMinter } from "./key-minter";

export const dynamic = "force-dynamic";
export const metadata = { title: "API keys" };

export default async function KeysPage() {
  const healthy = await apiHealthy();
  // The browser needs the public API URL to write a usable .mcp.json; it is not a secret — the key is.
  const apiUrl = process.env.REACHABLE_API_URL ?? "http://127.0.0.1:8787";

  return (
    <div className="mx-auto max-w-[820px] px-10 py-[52px] max-[900px]:px-5">
      <h1 className="m-0 text-[30px] font-medium leading-[1.15] tracking-[-0.02em] text-fg">API keys</h1>
      <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.7] text-mut">
        For asking the graph from a coding agent over MCP. Running the worker yourself needs no key at all — this is for
        querying <span className="font-mono text-[13px] text-signal-2">{apiUrl}</span>, the worker behind this console.{" "}
        <Link href="/docs/reference/run" className="text-fg underline decoration-line underline-offset-4 hover:decoration-mut">
          How to point a client at it
        </Link>
        .
      </p>

      <div className="mt-7">
        {healthy ? (
          <KeyMinter apiUrl={apiUrl} />
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
