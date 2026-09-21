import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

if (process.env.RUN_LIVE_CONTRACT_TESTS !== "1") {
  throw new Error(
    "Opt in to local platform writes with RUN_LIVE_CONTRACT_TESTS=1.",
  );
}
// Spend consent must come from this invocation, not a persisted dotenv file.
const runModelContracts = process.env.RUN_LIVE_MODEL_CONTRACT_TESTS === "1";
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

// These events enqueue model turns even on self_hosted environments without
// a worker. Keep them out of the model-free tier unless spend is opted in.
const modelContracts = ["**/outcomes.spec.ts", "**/deployments.spec.ts"];

export default defineConfig({
  testDir: "test/contracts",
  projects: [
    { name: "model-free", testIgnore: modelContracts },
    ...(runModelContracts
      ? [{ name: "model-backed", testMatch: modelContracts }]
      : []),
  ],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL, extraHTTPHeaders: { "x-api-key": key } },
});
