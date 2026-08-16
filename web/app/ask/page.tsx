import { apiHealthy } from "@/lib/api";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { q } = await searchParams;
  const healthy = await apiHealthy();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Ask the graph</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Typed questions map to verified traversals; the exact statement runs live inside HydraDB and is shown under every answer.
        </p>
      </header>
      <Chat initialQ={typeof q === "string" ? q : ""} healthy={healthy} />
    </div>
  );
}
