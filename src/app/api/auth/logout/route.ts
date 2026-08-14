import { NextRequest, NextResponse } from "next/server";
import { isHttpsRequest } from "@/lib/auth";
import { IDENTITY_COOKIE, deleteSession } from "@/lib/identity/session";

/**
 * Ends the console's own session.
 *
 * **POST, not GET.** A sign-out reachable by navigation is triggerable by any
 * `<img>` on any page, and while being signed out is not a breach it is a
 * denial of service an operator cannot explain.
 *
 * It does not call the provider's `end_session_endpoint`. Ending the session
 * *here* is the whole promise: the token this console holds is destroyed and
 * the handle is cleared. Whether the operator remains signed in to their
 * identity provider is that provider's business, and a console that logged
 * people out of their Google account because they left a tab would be
 * overreaching — plan 08 D2 keeps the cookie a handle for exactly this reason.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  deleteSession(request.cookies.get(IDENTITY_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(IDENTITY_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}
