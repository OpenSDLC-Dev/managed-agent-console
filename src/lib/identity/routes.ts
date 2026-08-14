import "server-only";
import { NextResponse } from "next/server";

/** Short-lived, binds a pending authorization to the browser that started it. */
export const AUTH_STATE_COOKIE = "console_auth_state";

/**
 * Reasons a sign-in can fail before a session exists. Deliberately a **closed
 * set of console-authored codes**, never the provider's text: the callback URL
 * is attacker-reachable, and anything reflected out of it lands on this
 * console's own login page wearing this console's hostname.
 */
export type AuthError =
  | "provider_unavailable"
  | "provider_refused"
  | "state_mismatch"
  | "session_failed";

/** Sends the browser back to the login page with a code the page can explain. */
export function authErrorRedirect(
  request: { nextUrl: URL },
  reason: AuthError,
): NextResponse {
  const url = new URL(request.nextUrl);
  url.pathname = "/login";
  url.search = `?sso_error=${reason}`;
  url.hash = "";
  return NextResponse.redirect(url, { status: 302 });
}
