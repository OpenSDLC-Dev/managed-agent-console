import "server-only";

/**
 * Server-side configuration. None of these values may ever be exposed to the
 * client (CLAUDE.md principle 2) — importing this module from client code
 * fails the build via "server-only".
 */
export function platformBaseUrl(): string {
  const url = process.env.PLATFORM_BASE_URL;
  if (!url) throw new Error("PLATFORM_BASE_URL is not set");
  return url.replace(/\/+$/, "");
}

export function platformApiKey(): string {
  const key = process.env.PLATFORM_API_KEY;
  if (!key) throw new Error("PLATFORM_API_KEY is not set");
  return key;
}

/** Unset ⇒ the login gate is disabled (loopback/dev deployments). */
export function consolePassword(): string | undefined {
  return process.env.CONSOLE_PASSWORD || undefined;
}
