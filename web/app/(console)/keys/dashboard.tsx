"use client";

import { useState } from "react";
import { Connectors } from "@/components/console/connectors";
import { KeyMinter } from "./key-minter";

// Mint above, connect below; the token flows between them and is never stored. One reveal state for
// the page — the key is printed in both halves, so masking only one would be decoration.
export function Dashboard({ endpoint }: { endpoint: string }) {
  const [token, setToken] = useState<string | undefined>();
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <KeyMinter endpoint={endpoint} revealed={revealed} onReveal={setRevealed} onMinted={setToken} />
      <Connectors endpoint={endpoint} token={token} revealed={revealed} />
    </div>
  );
}
