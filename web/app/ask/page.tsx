import { apiHealthy } from "@/lib/api";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask" };

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { q } = await searchParams;
  const healthy = await apiHealthy();
  return <Chat initialQ={typeof q === "string" ? q : ""} healthy={healthy} />;
}
