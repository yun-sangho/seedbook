import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// next.config.ts is evaluated as an ES module (package.json "type": "module"),
// so __dirname is not available. Derive it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Produce a self-contained Node server bundle under .next/standalone,
  // so we can run the app in any Docker host without Vercel.
  output: "standalone",
  // Monorepo: trace files from the repo root so pnpm workspace symlinks
  // (e.g. @seedbook/database, @prisma/client) are included in the bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Prisma's query engine (libquery_engine-*.so.node) is loaded via dlopen
  // at runtime, so Next.js's static file tracer misses it and the standalone
  // bundle ships without the .prisma/client directory. Force-include it.
  outputFileTracingIncludes: {
    "/**/*": ["../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
