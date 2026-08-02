import { defineConfig } from "@playwright/test";

const CONSOLE_PORT = 3100;
const MOCK_PORT = 18080;

export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: false,
  // One worker: the mock platform is stateful (session event log mutates)
  // and shared, so files must not interleave.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${CONSOLE_PORT}`,
  },
  webServer: [
    {
      command: "node test/mock-platform/server.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/v1/agents`,
      // The probe URL 401s without a key; any response means the server is up.
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      env: {
        MOCK_PLATFORM_PORT: String(MOCK_PORT),
        MOCK_PLATFORM_KEY: "test-key",
      },
    },
    {
      // Production server: dev-mode cold compiles are slow enough on some
      // machines that hydration outruns the test timeout, and prod is what
      // ships anyway. The build runs in the test:e2e script, before this.
      command: `pnpm exec next start --port ${CONSOLE_PORT}`,
      url: `http://127.0.0.1:${CONSOLE_PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PLATFORM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        PLATFORM_API_KEY: "test-key",
        CONSOLE_PASSWORD: "test-password",
      },
    },
  ],
});
