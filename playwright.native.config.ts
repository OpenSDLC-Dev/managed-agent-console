import { defineConfig } from "@playwright/test";
import { ensureLoopbackProxyBypass } from "./test/playwright-env";
ensureLoopbackProxyBypass();
export default defineConfig({
  testDir: "test/native",
  testMatch: process.env.NATIVE_FIDELITY
    ? "fidelity.spec.ts"
    : "contract.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: [["list"]],
  outputDir: process.env.NATIVE_EVIDENCE_DIR
    ? `${process.env.NATIVE_EVIDENCE_DIR}/native-results`
    : "test-results/native",
  use: {
    baseURL: "http://127.0.0.1:38200",
    locale: "en-US",
    trace: "off",
    viewport: { width: 1440, height: 900 },
    ...(process.env.NATIVE_FIDELITY ? { channel: "chrome" } : {}),
  },
  projects: process.env.NATIVE_FIDELITY
    ? [
        { name: "light", use: { colorScheme: "light" } },
        { name: "dark", use: { colorScheme: "dark" } },
      ]
    : [{ name: "native" }],
  webServer: {
    command: "node test/native/runtime.mjs",
    url: "http://127.0.0.1:38200/api/auth/config",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    timeout: 180_000,
  },
});
