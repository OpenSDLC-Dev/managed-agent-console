import { defineConfig } from "@playwright/test";
import { LIVE_CONSOLE_PASSWORD, resolveLiveEnv } from "./test/e2e-live/env";

/**
 * Live tier: the console's production build against a REAL platform stack
 * (the platform repo's deploy/compose), spending real model tokens.
 * Opt-in and fail-not-skip semantics live in resolveLiveEnv().
 *
 * Run with: RUN_LIVE_CONSOLE_TESTS=1 pnpm test:e2e:live
 */
const CONSOLE_PORT = 3200;
const { baseUrl, apiKey } = resolveLiveEnv();

export default defineConfig({
  testDir: "test/e2e-live",
  fullyParallel: false,
  // One worker, no retries: these tests mutate one shared real platform,
  // and a retried model turn would double the spend.
  workers: 1,
  retries: 0,
  // Real model turns take minutes, not seconds.
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${CONSOLE_PORT}`,
    locale: "en-US",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `pnpm exec next start --port ${CONSOLE_PORT}`,
      url: `http://127.0.0.1:${CONSOLE_PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PLATFORM_BASE_URL: baseUrl,
        PLATFORM_API_KEY: apiKey,
        CONSOLE_PASSWORD: LIVE_CONSOLE_PASSWORD,
      },
    },
  ],
});
