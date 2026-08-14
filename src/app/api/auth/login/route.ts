import { NextRequest, NextResponse } from "next/server";
import { isHttpsRequest } from "@/lib/auth";
import { consoleAuthMode } from "@/lib/identity/mode";
import { codeChallenge, randomToken } from "@/lib/identity/pkce";
import { AUTH_STATE_COOKIE, authErrorRedirect } from "@/lib/identity/routes";
import { discover } from "@/lib/identity/discovery";
import {
  authorizationUrl,
  resolveRedirectUri,
  safeReturnTo,
} from "@/lib/identity/rp";
import { putPending } from "@/lib/identity/session";

/**
 * Starts the authorization-code flow.
 *
 * **Anonymous by construction** — nobody can be signed in before this runs, and
 * `src/proxy.ts` exempts the whole `/api/auth/` prefix for exactly that reason.
 * So everything it creates is created on an anonymous caller's say-so, which is
 * why the pending-authorization map is capped and swept.
 */
export const dynamic = "force-dynamic";

/** Long enough for a slow provider and a password manager; short enough that an abandoned flow is not a lingering record. */
const STATE_COOKIE_MAX_AGE_S = 10 * 60;

export async function GET(request: NextRequest): Promise<Response> {
  const mode = consoleAuthMode();
  if (mode.kind !== "sso") {
    // Not "forbidden": on a deployment without identity this surface does not
    // exist, and saying so is the same answer any unrouted path gets.
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

  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"));
  const redirectUri = resolveRedirectUri(request, mode.identity);

  let authorization: string;
  const state = randomToken();
  try {
    const metadata = await discover(mode.identity);
    const verifier = randomToken();
    const nonce = randomToken();
    putPending(state, {
      verifier,
      nonce,
      returnTo,
      redirectUri,
      createdAt: Date.now(),
    });
    authorization = authorizationUrl(metadata, mode.identity, {
      state,
      nonce,
      codeChallenge: await codeChallenge(verifier),
      redirectUri,
    });
  } catch {
    // Discovery is the only thing here that talks to the network. Its message
    // names the provider rather than quoting it, and is not reflected into the
    // browser at all — the login page says sign-in is unavailable.
    return authErrorRedirect(request, "provider_unavailable");
  }

  const response = NextResponse.redirect(authorization, { status: 302 });
  // `state` is bound to *this* browser, not merely remembered by the server.
  // Without this a third party could start a flow, keep its `state`, and walk a
  // victim through the callback to land the attacker's identity in the victim's
  // console — login CSRF, whose whole point is that the victim never notices.
  response.cookies.set(AUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    // Narrow on purpose: nothing outside the callback ever reads it.
    path: "/api/auth",
    maxAge: STATE_COOKIE_MAX_AGE_S,
  });
  return response;
}
