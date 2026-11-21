import { consoleBuildVersion } from "./scripts/build-version.mjs";

/** @type {import("next").NextConfig} */
const nextConfig = {
  env: {
    CONSOLE_BUILD_VERSION: consoleBuildVersion(
      import.meta.dirname,
      process.env.CONSOLE_BUILD_VERSION,
    ),
  },
  // Single-container deployment (Dockerfile) uses the standalone server.
  output: "standalone",
  // gzip buffers proxied SSE (no bytes → headers held back → the stream
  // never opens client-side). Assets are small; trade compression for
  // working live traces.
  compress: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
