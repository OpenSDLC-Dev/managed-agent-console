import { defineConfig } from "@playwright/test";
import { resolveLiveEnv } from "./test/e2e-live/env";
import { ensureLoopbackProxyBypass } from "./test/playwright-env";

ensureLoopbackProxyBypass();

/**
 * Live tier: the console's production build against a REAL platform stack
 * (the platform repo's deploy/compose), spending real model tokens.
 * Opt-in and fail-not-skip semantics live in resolveLiveEnv().
 *
 * Run with: RUN_LIVE_CONSOLE_TESTS=1 pnpm test:e2e:live
 */
const CONSOLE_PORT = 3200;
const { baseUrl, gatewayUrl } = resolveLiveEnv();

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
      command: `pnpm exec next start --port 3190`,
      url: "http://127.0.0.1:3190/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node test/mock-platform/edge.mjs",
      url: `http://127.0.0.1:${CONSOLE_PORT}/api/auth/config`,
      reuseExistingServer: false,
      env: {
        MOCK_EDGE_PORT: String(CONSOLE_PORT),
        MOCK_CONSOLE_PORT: "3190",
        MOCK_PLATFORM_URL: baseUrl,
        MOCK_GATEWAY_URL: gatewayUrl ?? baseUrl,
      },
    },
  ],
});
