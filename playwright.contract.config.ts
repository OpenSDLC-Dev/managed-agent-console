import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

if (process.env.RUN_LIVE_CONTRACT_TESTS !== "1") {
  throw new Error(
    "Opt in to local, model-free writes with RUN_LIVE_CONTRACT_TESTS=1.",
  );
}
loadEnvConfig(process.cwd());
const baseURL = process.env.PLATFORM_BASE_URL;
const key = process.env.PLATFORM_API_KEY;
if (!baseURL || !key)
  throw new Error(
    "Set PLATFORM_BASE_URL and PLATFORM_API_KEY for the local platform.",
  );
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error("Contract tests only target a local platform.");
}

export default defineConfig({
  testDir: "test/contracts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL, extraHTTPHeaders: { "x-api-key": key } },
});
