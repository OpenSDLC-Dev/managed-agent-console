import { defineConfig } from "@playwright/test";
import {
  CONSOLE_PORTS,
  consoleUrl,
  IDP_CLIENT_ID,
  IDP_ISSUER,
  IDP_PORT,
  MOCK_PORT,
  MOCK_URL,
} from "./test/fidelity/consoles";

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

export default defineConfig({
  testDir: "test/fidelity",
  // Playwright's default testMatch takes `*.test.ts` as well as `*.spec.ts`,
  // which would collect `surfaces.test.ts` — a Vitest file — and die on the
  // vitest import. The two runners share this directory; only the walker is
  // Playwright's.
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  // The mock platform is stateful and shared; shots must not interleave.
  workers: 1,
  reporter: [["list"]],
  use: {
    // Names the password console, which is what all but two surfaces are shot
    // against — but the walker never relies on it: it resolves a base per
    // surface from `surface.mode`, because this pass drives two consoles.
    baseURL: consoleUrl("password"),
    // Token counts render through toLocaleString — don't let the host's
    // locale change the separators between one pass and the next.
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    // Real Google Chrome, not Playwright's bundled Chromium: CLAUDE.md's
    // clause says fidelity is verified *in Chrome*, and the reference facts in
    // docs/design-reference.md were extracted there. Font rasterization and
    // form-control rendering differ between the two, which is exactly what a
    // fidelity shot is looking at. Requires Chrome on the machine — fine for
    // an on-demand local pass that CI never runs (review finding, PR #38).
    channel: "chrome",
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
      // One process, two ports: the platform double, and the stub identity
      // provider it hosts beside itself (`test/mock-platform/oidc.mjs`). The
      // provider binds first, so this probe answering means both are up.
      command: "node test/mock-platform/server.mjs",
      url: `${MOCK_URL}/v1/agents`,
      // The probe URL 401s without a key; any response means it is up.
      reuseExistingServer: false,
      env: {
        MOCK_PLATFORM_PORT: String(MOCK_PORT),
        MOCK_PLATFORM_KEY: "test-key",
        MOCK_OIDC_PORT: String(IDP_PORT),
        // The same constant the console is handed below: discovery compares the
        // document's issuer to IDENTITY_OIDC_ISSUER byte for byte.
        MOCK_OIDC_ISSUER: IDP_ISSUER,
        MOCK_OIDC_CLIENT_ID: IDP_CLIENT_ID,
      },
    },
    {
      // Production server: what ships, and what the reference is compared to.
      // The build runs in the fidelity:shots script, before this — and both
      // consoles share it, because `identityConfig()` reads the environment per
      // call and every identity-aware route is force-dynamic.
      command: `pnpm exec next start --port ${CONSOLE_PORTS.password}`,
      url: `${consoleUrl("password")}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PLATFORM_BASE_URL: MOCK_URL,
        PLATFORM_API_KEY: "test-key",
        CONSOLE_PASSWORD: "test-password",
        // Stated rather than left unset: `next start` fills anything this block
        // does not name from a developer's `.env.local`, and an IDENTITY_MODE
        // left there would quietly turn the reference console into the SSO one
        // halfway through a pass.
        IDENTITY_MODE: "disabled",
      },
    },
    {
      // The identity deployment (#99): the only console that renders the SSO
      // login page and the sidebar account block.
      command: `pnpm exec next start --port ${CONSOLE_PORTS.sso}`,
      url: `${consoleUrl("sso")}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      // Every variable this console's identity flow reads is named here, and
      // the ones it must NOT have are named as empty rather than omitted.
      // Omitting is not the same as clearing: `next start` fills anything this
      // block leaves out from the invoking shell or a developer's `.env.local`,
      // so an omitted variable is whatever that machine happens to hold. All
      // four below read as absent when empty (`env.ts`, `identity/config.ts`).
      env: {
        PLATFORM_BASE_URL: MOCK_URL,
        // Cleared, not omitted. In identity mode the BFF never reads it, so a
        // page that renders here can only have rendered on the operator's own
        // token — which is what these shots are evidence of. Inheriting a real
        // key would let a regression that fell back to the management
        // credential keep this shot green, and quietly void that evidence.
        PLATFORM_API_KEY: "",
        // With a password set, the gate would stand in front of the very page
        // being shot.
        CONSOLE_PASSWORD: "",
        IDENTITY_MODE: "oidc",
        IDENTITY_OIDC_ISSUER: IDP_ISSUER,
        IDENTITY_OIDC_CLIENT_ID: IDP_CLIENT_ID,
        // A public client: with a secret the exchange would authenticate over
        // Basic instead, which is a different code path than the one this tier
        // means to walk (the stub accepts either, so it would fail silently).
        IDENTITY_OIDC_CLIENT_SECRET: "",
        // Empty so the *derived* redirect URI is exercised — the path a
        // deployment without the variable takes, deterministic here because
        // Chrome sends no x-forwarded-host and Playwright always arrives on
        // 127.0.0.1:<port>. Inheriting a developer's own value (a callback on
        // port 3000, say) would send Chrome to a different server mid-flow.
        IDENTITY_OIDC_REDIRECT_URL: "",
        // Empty means the default openid/profile/email, which is what the stub
        // is written against; an inherited set without `openid` fails closed at
        // config time and takes the whole pass with it.
        IDENTITY_OIDC_SCOPES: "",
      },
    },
  ],
});
