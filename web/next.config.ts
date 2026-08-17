import type { NextConfig } from "next";
import path from "node:path";

// The console reads repo files outside web/ at request time (committed reports in worker/out,
// the guide's markdown in docs/, its figures, demo/services.txt). On Vercel the project root is
// web/, so those files must be traced into the serverless bundles explicitly.
const repoRoot = path.resolve(__dirname, "..");
const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/**": ["../worker/out/**", "../docs/**", "../demo/**"],
  },
};

export default nextConfig;
