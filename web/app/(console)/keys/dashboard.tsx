"use client";

import { useState } from "react";
import { Connectors } from "@/components/console/connectors";
import { KeyMinter } from "./key-minter";

// Mint above, connect below; the token flows between them and is never stored.
export function Dashboard({ endpoint }: { endpoint: string }) {
  const [token, setToken] = useState<string | undefined>();
  return (
    <div className="flex flex-col gap-5">
      <KeyMinter endpoint={endpoint} onMinted={setToken} />
      <Connectors endpoint={endpoint} token={token} />
    </div>
  );
}
