import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single-container deployment (Dockerfile) uses the standalone server.
  output: "standalone",
  // gzip buffers proxied SSE (no bytes → headers held back → the stream
  // never opens client-side). Assets are small; trade compression for
  // working live traces.
  compress: false,
};

export default nextConfig;
