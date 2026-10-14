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

/**
 * Base URL of the platform's model gateway (`cmd/modelgateway`), whose
 * `/admin/v1/` API the gateway screens drive. Unset ⇒ this deployment runs no
 * gateway the console manages, and the gateway BFF answers every path 404 so
 * the screens hide (plan 10 decision 5). Optional, unlike PLATFORM_BASE_URL.
 */
export function modelGatewayBaseUrl(): string | undefined {
  const url = process.env.MODEL_GATEWAY_BASE_URL;
  return url ? url.replace(/\/+$/, "") : undefined;
}

/** Unset ⇒ the login gate is disabled (loopback/dev deployments). */
export function consolePassword(): string | undefined {
  return process.env.CONSOLE_PASSWORD || undefined;
}
