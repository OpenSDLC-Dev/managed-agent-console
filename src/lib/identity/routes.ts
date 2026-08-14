import "server-only";
import { NextResponse } from "next/server";
import { isHttpsRequest } from "@/lib/auth";
import { requestOrigin } from "./rp";
import { IDENTITY_COOKIE } from "./session";

/** Short-lived, binds a pending authorization to the browser that started it. */
export const AUTH_STATE_COOKIE = "console_auth_state";

/**
 * Drops the session handle from the browser.
 *
 * Two routes end a session — the operator asking (`/api/auth/logout`) and the
 * platform refusing their token (the BFF) — and a handle cleared with different
 * attributes than it was set with is a handle the browser keeps. One place, so
 * the attributes cannot drift apart.
 */
export function clearIdentityCookie<T extends NextResponse>(
  response: T,
  request: { headers: Headers; nextUrl: URL },
): T {
  response.cookies.set(IDENTITY_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}

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
  request: { headers: Headers; nextUrl: URL },
  reason: AuthError,
): NextResponse {
  // Built from the origin the browser used, not from `nextUrl` — see
  // `requestOrigin`. A failed sign-in that lands on the wrong host looks to the
  // operator exactly like a console that is down.
  const url = new URL("/login", requestOrigin(request));
  url.search = `?sso_error=${reason}`;
  return NextResponse.redirect(url, { status: 302 });
}
