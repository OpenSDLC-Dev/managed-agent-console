import "server-only";
import { NextResponse } from "next/server";
import { isHttpsRequest } from "@/lib/auth";
import { safeReturnTo } from "./rp";
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

/**
 * A 302 to a path on **this** console, carrying no host of its own.
 *
 * `Location` may be a relative reference (RFC 9110 §10.2.2), which the browser
 * resolves against the URL it actually requested. That is the only origin this
 * console can be sure of, and choosing it costs nothing:
 *
 * - `request.nextUrl.origin` is the address the server **bound**, not the one
 *   the browser used. The standalone server this repo ships as a Docker image
 *   binds `HOSTNAME=0.0.0.0`, so a redirect built from it sent the operator to
 *   `http://0.0.0.0:3300/agents` — an origin their host-only session cookie
 *   never reached — at the end of a sign-in that had just succeeded. Observed
 *   twice against the bundled Casdoor (plan 08 slice 5).
 * - The forwarded host is the browser's, but it is **client-supplied** wherever
 *   an ingress does not overwrite it. `resolveRedirectUri` survives that
 *   because a redirect URI must be pre-registered at the provider; a `Location`
 *   is pre-registered nowhere, so trusting the header here would make the
 *   anonymous half of `/api/auth/callback` an open redirect wearing this
 *   deployment's hostname (dual review, PR #100).
 *
 * The path is re-narrowed on the way out rather than trusted for having been
 * narrowed on the way in, because this is the one place a mistake becomes that
 * open redirect on a page the operator has just been asked to trust.
 */
export function sameOriginRedirect(path: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: { location: safeReturnTo(path) },
  });
}

/** Sends the browser back to the login page with a code the page can explain. */
export function authErrorRedirect(reason: AuthError): NextResponse {
  return sameOriginRedirect(`/login?sso_error=${reason}`);
}
