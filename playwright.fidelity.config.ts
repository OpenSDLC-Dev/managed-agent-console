import { defineConfig } from "@playwright/test";

/**
 * The Chrome fidelity pass's shot walker (plan 04 slice 4) — not a test tier.
 *
 * `pnpm fidelity:shots` walks `test/fidelity/surfaces.ts` and writes one PNG
 * per surface per theme to a gitignored `fidelity-shots/`. Nothing here
 * asserts: the comparison against the Claude Console reference is a human
 * judgement made against `docs/design-reference.md`. This exists so the pass
 * has an enumerated denominator instead of whatever was navigated to that day.
 *
 * A separate config rather than a project inside `playwright.config.ts`, so
 * `pnpm test:e2e` neither runs it nor waits for it — same split as
 * `playwright.live.config.ts`. The mock platform and console servers are
 * declared identically to the e2e config; keep them in step.
 */

const CONSOLE_PORT = 3101;
const MOCK_PORT = 18081;

export default defineConfig({
  testDir: "test/fidelity",
  fullyParallel: false,
  // The mock platform is stateful and shared; shots must not interleave.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${CONSOLE_PORT}`,
    // Token counts render through toLocaleString — don't let the host's
    // locale change the separators between one pass and the next.
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  },
  // Both themes, as CLAUDE.md's fidelity clause requires. `ThemeProvider` is
  // `defaultTheme="system" enableSystem`, so emulating the media query at the
  // context drives the real toggle path without stubbing storage.
  projects: [
    { name: "light", use: { colorScheme: "light" } },
    { name: "dark", use: { colorScheme: "dark" } },
  ],
  webServer: [
    {
      command: "node test/mock-platform/server.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/v1/agents`,
      // The probe URL 401s without a key; any response means it is up.
      reuseExistingServer: false,
      env: {
        MOCK_PLATFORM_PORT: String(MOCK_PORT),
        MOCK_PLATFORM_KEY: "test-key",
      },
    },
    {
      // Production server: what ships, and what the reference is compared to.
      // The build runs in the fidelity:shots script, before this.
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
