import { loadEnvConfig } from "@next/env";

/** Origins the live tier will target — the local platform stack, only. */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Live-tier configuration (CLAUDE.md contract): consent comes from
 * RUN_LIVE_CONSOLE_TESTS=1; once consented, missing configuration FAILS —
 * it never silently skips. `.env.local` is parsed by @next/env, exactly the
 * way `next dev`/`next start` read it (quotes, export prefixes, comments,
 * expansion), and an already-set process environment wins.
 */
export function resolveLiveEnv(): { baseUrl: string; apiKey: string } {
  if (process.env.RUN_LIVE_CONSOLE_TESTS !== "1") {
    throw new Error(
      "The live tier drives a real platform stack and spends real model tokens. " +
        "Opt in explicitly with RUN_LIVE_CONSOLE_TESTS=1.",
    );
  }
  loadEnvConfig(process.cwd());
  const baseUrl = process.env.PLATFORM_BASE_URL;
  const apiKey = process.env.PLATFORM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "RUN_LIVE_CONSOLE_TESTS=1 is set but PLATFORM_BASE_URL / PLATFORM_API_KEY " +
        "are missing (environment or .env.local). The live tier fails rather than skips — configure both.",
    );
  }
  // This suite creates, mutates, and spends. A mistyped base URL must not
  // aim it at a remote deployment (review finding, PR #30).
  const { hostname } = new URL(baseUrl);
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      `PLATFORM_BASE_URL points at "${hostname}" — the live tier only targets the local platform stack.`,
    );
  }
  return { baseUrl, apiKey };
}

/** The password the live config gives the spawned console instance. */
export const LIVE_CONSOLE_PASSWORD = "live-test-password";
