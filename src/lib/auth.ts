/**
 * Console login gate — a single shared password (CONSOLE_PASSWORD).
 *
 * The session cookie carries an HMAC of a fixed message keyed by the
 * password, so a cookie minted under one password is invalid after the
 * password changes. Web Crypto only: this module runs in both the Node
 * runtime (login route) and the Edge runtime (middleware).
 */
export const SESSION_COOKIE = "console_session";

const MESSAGE = "managed-agent-console-session-v1";

/**
 * Whether the browser reached this console over TLS — the `Secure` predicate
 * for every cookie this console mints.
 *
 * `request.nextUrl.protocol` alone is wrong behind a TLS-terminating load
 * balancer, which is every deployment in `deploy/`: the pod sees plain `http:`
 * and would mint a session cookie without `Secure`, sendable over a downgraded
 * connection. Harmless while production sets no `CONSOLE_PASSWORD` and mints no
 * cookie at all; a live bug the moment plan 08 mints one.
 *
 * The two signals are OR'd rather than the header simply winning, because a
 * forwarded header is client-supplied where no proxy overwrites it: taking it
 * on its own would let a request assert `http` and strip `Secure` from a cookie
 * minted over a genuinely TLS connection. In this direction a spoofed header
 * can only *add* the flag.
 */
export function isHttpsRequest(request: {
  headers: { get(name: string): string | null };
  nextUrl: { protocol: string };
}): boolean {
  // A proxy chain appends, so the client's own scheme is the first entry.
  const forwarded = (request.headers.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return forwarded === "https" || request.nextUrl.protocol === "https:";
}

export async function sessionTokenFor(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(MESSAGE));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function isValidSession(
  token: string | undefined,
  password: string,
): Promise<boolean> {
  if (!token) return false;
  const expected = await sessionTokenFor(password);
  if (token.length !== expected.length) return false;
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
