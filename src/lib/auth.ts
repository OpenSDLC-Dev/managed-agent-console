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
