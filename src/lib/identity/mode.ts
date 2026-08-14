import "server-only";
import { consolePassword } from "@/lib/env";
import { type IdentityConfig, identityConfig, type OidcConfig } from "./config";

/**
 * Which gate governs this console, and what the BFF is allowed to send on a
 * user's behalf — plan 08 D3's mode matrix, stated rather than left to emerge.
 *
 * Two independent switches (`CONSOLE_PASSWORD`, `IDENTITY_MODE`) make four
 * configurations, and an unspecified overlap is exactly where a password
 * session silently reacquires root:
 *
 * | CONSOLE_PASSWORD | identity | gate                    | BFF sends                    |
 * | ---------------- | -------- | ----------------------- | ---------------------------- |
 * | set              | unset    | password                | `x-api-key` (unchanged)      |
 * | unset            | set      | SSO                     | `Bearer`; no session ⇒ 401   |
 * | set              | set      | SSO, behind the password | `Bearer` only                |
 * | unset            | unset    | none                    | `x-api-key` (local dev)      |
 *
 * The load-bearing row is the third. When identity is configured, a
 * password-authenticated session **never** reaches the platform: it does not
 * fall back to `x-api-key`, it does not borrow another user's session, it gets
 * 401 and a prompt to sign in. The password gate's job in that configuration is
 * deployment protection in front of the login page, nothing more — so it is
 * carried as `passwordGate`, not as a second way to be authorized.
 */
export type ConsoleAuthMode =
  /** Identity is configured. `passwordGate` is deployment protection in front of the login page. */
  | { kind: "sso"; identity: OidcConfig; passwordGate: boolean }
  /** The shared-password gate, and the management key behind it. */
  | { kind: "password"; password: string }
  /** No gate: loopback development, or a deployment gated by something in front of this process. */
  | { kind: "open" };

/** Reads the process environment. Throws `IdentityConfigError` on a broken identity configuration — fail closed, never silently unauthenticated. */
export function consoleAuthMode(): ConsoleAuthMode {
  return consoleAuthModeFrom(identityConfig(), consolePassword());
}

/** The matrix itself, over values rather than the environment, so every row is a test. */
export function consoleAuthModeFrom(
  identity: IdentityConfig,
  password: string | undefined,
): ConsoleAuthMode {
  if (identity.mode === "oidc") {
    // Named field by field rather than spread: `mode` is this union's
    // discriminant and carrying a second copy of it inside the payload is how
    // the two drift.
    const { issuer, clientId, clientSecret, redirectUrl, scopes } = identity;
    return {
      kind: "sso",
      identity: { issuer, clientId, clientSecret, redirectUrl, scopes },
      passwordGate: password !== undefined,
    };
  }
  if (password !== undefined) return { kind: "password", password };
  return { kind: "open" };
}

/**
 * Whether a platform call is made as the signed-in human rather than with the
 * management key. This is the console's whole authorization posture in one
 * predicate, and it is deliberately **not** "a session exists": in SSO mode a
 * request without a session is a 401, never a call carrying `x-api-key`. The
 * management key stays in the pod for the deep health check, so a fallback
 * would silently restore root for an unauthenticated browser.
 */
export function sendsUserToken(mode: ConsoleAuthMode): boolean {
  return mode.kind === "sso";
}
