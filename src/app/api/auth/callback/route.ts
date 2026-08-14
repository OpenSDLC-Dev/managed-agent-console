import { NextRequest, NextResponse } from "next/server";
import { isHttpsRequest } from "@/lib/auth";
import { discover } from "@/lib/identity/discovery";
import { consoleAuthMode } from "@/lib/identity/mode";
import { randomToken, timingSafeEqual } from "@/lib/identity/pkce";
import { AUTH_STATE_COOKIE, authErrorRedirect } from "@/lib/identity/routes";
import { exchangeCode, verifyIdToken } from "@/lib/identity/rp";
import {
  IDENTITY_COOKIE,
  putSession,
  takePending,
} from "@/lib/identity/session";

/**
 * The identity provider's redirect back.
 *
 * Everything in the query string is attacker-authored: this URL sits in browser
 * history, in referrers, and in whatever the provider logged. So the handler
 * proves three separate things before it will mint a session — that this
 * browser started a flow (the state cookie), that the flow is one this process
 * is still holding (the pending record, removed on read), and that the token
 * belongs to that flow (the nonce) — and it reflects nothing back.
 */
export const dynamic = "force-dynamic";

/** A day is the ceiling; the ID token's own `exp` almost always lands first. */
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest): Promise<Response> {
  const mode = consoleAuthMode();
  if (mode.kind !== "sso") {
    return NextResponse.json(
      {
        type: "error",
        error: {
          type: "not_found_error",
          message: "single sign-on is not configured on this deployment",
        },
      },
      { status: 404 },
    );
  }

  const params = request.nextUrl.searchParams;
  const cookieState = request.cookies.get(AUTH_STATE_COOKIE)?.value;
  const queryState = params.get("state");

  // The provider can also answer with an error instead of a code — a user who
  // pressed "cancel", a client the provider does not recognise. Its `error`
  // parameter is not reflected: the browser gets this console's own code.
  if (params.get("error") !== null) {
    return clearState(authErrorRedirect(request, "provider_refused"), request);
  }

  if (
    cookieState === undefined ||
    queryState === null ||
    !timingSafeEqual(cookieState, queryState)
  ) {
    return clearState(authErrorRedirect(request, "state_mismatch"), request);
  }

  // Removed on read, so a callback URL replayed from history cannot mint a
  // second session from the same authorization.
  const pending = takePending(queryState, Date.now());
  const code = params.get("code");
  if (pending === undefined || code === null || code === "") {
    return clearState(authErrorRedirect(request, "state_mismatch"), request);
  }

  let sessionId: string;
  try {
    const metadata = await discover(mode.identity);
    const tokens = await exchangeCode(metadata, mode.identity, {
      code,
      verifier: pending.verifier,
      redirectUri: pending.redirectUri,
    });
    const identity = await verifyIdToken(
      metadata,
      mode.identity,
      tokens.idToken,
      pending.nonce,
    );
    sessionId = randomToken();
    putSession(sessionId, {
      idToken: tokens.idToken,
      ...(tokens.refreshToken === undefined
        ? {}
        : { refreshToken: tokens.refreshToken }),
      // A provider that hands out a very long-lived token does not get to
      // decide how long this console holds one on its behalf.
      expiresAt: Math.min(identity.expiresAt, Date.now() + MAX_SESSION_MS),
      subject: identity.subject,
      ...(identity.email === undefined ? {} : { email: identity.email }),
      ...(identity.name === undefined ? {} : { name: identity.name }),
    });
  } catch {
    // Every failure past this point is one code: a browser at the end of a
    // redirect has no use for the difference, and the difference is exactly
    // what an attacker probing a callback would like to learn.
    return clearState(authErrorRedirect(request, "session_failed"), request);
  }

  // Resolved against this origin rather than assigned to `pathname`, so a
  // return path carrying a query survives intact. `safeReturnTo` already
  // refused everything that could resolve off-origin; the check below is the
  // belt to that brace, because this is the one place a mistake becomes an open
  // redirect on a page the operator has just been asked to trust.
  const destination = new URL(pending.returnTo, request.nextUrl.origin);
  if (destination.origin !== request.nextUrl.origin) {
    return clearState(authErrorRedirect(request, "state_mismatch"), request);
  }
  const response = NextResponse.redirect(destination, { status: 302 });
  response.cookies.set(IDENTITY_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    // No Max-Age: a session cookie, so the handle dies with the browser
    // session. The server-side record carries the real lifetime.
  });
  return clearState(response, request);
}

/** The state cookie is single-use; it is cleared on every exit from this route. */
function clearState(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  response.cookies.set(AUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/api/auth",
    maxAge: 0,
  });
  return response;
}
