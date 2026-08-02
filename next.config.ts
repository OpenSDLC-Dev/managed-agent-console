import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single-container deployment (Dockerfile) uses the standalone server.
  output: "standalone",
};

export default nextConfig;
