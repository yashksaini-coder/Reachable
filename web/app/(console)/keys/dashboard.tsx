"use client";

import { useState } from "react";
import { Connectors } from "@/components/console/connectors";
import { KeyMinter } from "./key-minter";

// Mint above, connect below; the token flows between them and is never stored.
export function Dashboard({ apiUrl }: { apiUrl: string }) {
  const [token, setToken] = useState<string | undefined>();
  return (
    <div className="flex flex-col gap-5">
      <KeyMinter apiUrl={apiUrl} onMinted={setToken} />
      <Connectors apiUrl={apiUrl} token={token} />
    </div>
  );
}
