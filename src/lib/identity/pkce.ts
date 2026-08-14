import "server-only";

/**
 * The random values an authorization-code flow needs, and the S256 challenge.
 *
 * Web Crypto only — no new dependency for what the platform runtime already
 * provides, and the same primitives `src/lib/auth.ts` already uses.
 */

/** 32 bytes of CSPRNG output, base64url. Long enough that `state` and `nonce` are unguessable and a verifier meets RFC 7636's 43-character floor. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * The S256 code challenge for a verifier (RFC 7636 §4.2).
 *
 * `plain` is not offered. It is legal in the RFC and worthless here: a
 * challenge equal to the verifier protects against nothing an attacker who
 * intercepted the authorization response cannot already do.
 */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

/** Constant-time comparison, for `state` — which arrives from the browser. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
