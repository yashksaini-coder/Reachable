import "server-only";

// The ONLY place the graph token is read. `server-only` makes importing this from a
// Client Component a build error, so the token cannot reach the browser by accident.
// Never prefix any of these NEXT_PUBLIC_.
export const env = {
  HYDRA_URI: process.env.HYDRA_URI ?? "bolt://127.0.0.1:7687",
  HYDRA_HTTP_URL: process.env.HYDRA_HTTP_URL ?? "http://127.0.0.1:8443",
  HYDRA_DATABASE: process.env.HYDRA_DATABASE ?? "default",
  HYDRA_TOKEN: process.env.HYDRA_TOKEN ?? "",
};
