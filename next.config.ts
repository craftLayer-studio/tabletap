import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite loads its WASM and data files from node_modules at runtime; do not bundle it.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
