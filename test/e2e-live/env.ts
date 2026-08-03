import { existsSync, readFileSync } from "node:fs";

/**
 * Live-tier configuration (CLAUDE.md contract): consent comes from
 * RUN_LIVE_CONSOLE_TESTS=1; once consented, missing configuration FAILS —
 * it never silently skips. Values come from the process environment first,
 * then .env.local (the same file `pnpm dev` uses), so a configured checkout
 * needs nothing extra.
 */
export function resolveLiveEnv(): { baseUrl: string; apiKey: string } {
  if (process.env.RUN_LIVE_CONSOLE_TESTS !== "1") {
    throw new Error(
      "The live tier drives a real platform stack and spends real model tokens. " +
        "Opt in explicitly with RUN_LIVE_CONSOLE_TESTS=1.",
    );
  }
  const fromEnvLocal = (name: string): string | undefined => {
    if (!existsSync(".env.local")) return undefined;
    return readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((line) => line.startsWith(`${name}=`))
      ?.slice(name.length + 1)
      .trim();
  };
  const baseUrl =
    process.env.PLATFORM_BASE_URL ?? fromEnvLocal("PLATFORM_BASE_URL");
  const apiKey =
    process.env.PLATFORM_API_KEY ?? fromEnvLocal("PLATFORM_API_KEY");
  if (!baseUrl || !apiKey) {
    throw new Error(
      "RUN_LIVE_CONSOLE_TESTS=1 is set but PLATFORM_BASE_URL / PLATFORM_API_KEY " +
        "are missing (environment or .env.local). The live tier fails rather than skips — configure both.",
    );
  }
  return { baseUrl, apiKey };
}

/** The password the live config gives the spawned console instance. */
export const LIVE_CONSOLE_PASSWORD = "live-test-password";
