import { defineConfig } from "@playwright/test";
import {
  CONSOLE_PORTS,
  consoleUrl,
  MOCK_PORT,
  MOCK_URL,
  GATEWAY_PORT,
} from "./test/fidelity/consoles";
import { ensureLoopbackProxyBypass } from "./test/playwright-env";
ensureLoopbackProxyBypass();
const NEXT_PORT = 3091;
// The mock walker covers presentation; native surfaces use the real-platform
// walker in playwright.native.config.ts. Both use a cookie-owning edge.
export default defineConfig({
  testDir: "test/fidelity",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: consoleUrl("password"),
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    channel: "chrome",
  },
  projects: [
    { name: "light", use: { colorScheme: "light" } },
    { name: "dark", use: { colorScheme: "dark" } },
  ],
  webServer: [
    {
      command: "node test/mock-platform/server.mjs",
      url: `${MOCK_URL}/api/auth/config`,
      reuseExistingServer: false,
      env: {
        MOCK_PLATFORM_PORT: String(MOCK_PORT),
        MOCK_GATEWAY_PORT: String(GATEWAY_PORT),
        MOCK_OIDC_ORIGIN: consoleUrl("sso"),
      },
    },
    {
      command: `pnpm exec next start --port ${NEXT_PORT}`,
      url: `http://127.0.0.1:${NEXT_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    ...(["password", "sso"] as const).map((mode) => ({
      command: "node test/mock-platform/edge.mjs",
      url: `${consoleUrl(mode)}/api/auth/config`,
      reuseExistingServer: false,
      env: {
        MOCK_EDGE_PORT: String(CONSOLE_PORTS[mode]),
        MOCK_CONSOLE_PORT: String(NEXT_PORT),
        MOCK_PLATFORM_PORT: String(MOCK_PORT),
        MOCK_GATEWAY_PORT: String(GATEWAY_PORT),
      },
    })),
  ],
});
