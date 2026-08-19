"use client";

import { useState } from "react";
import { Connectors } from "@/components/console/connectors";
import { KeyMinter } from "./key-minter";

// Mint above, connect below, and the token flows between them so the config a reader copies is
// already theirs. The token lives in this component only — never stored, gone on navigation.
export function Dashboard({ apiUrl }: { apiUrl: string }) {
  const [token, setToken] = useState<string | undefined>();
  return (
    <div className="flex flex-col gap-5">
      <KeyMinter apiUrl={apiUrl} onMinted={setToken} />
      <Connectors apiUrl={apiUrl} token={token} />
    </div>
  );
}
