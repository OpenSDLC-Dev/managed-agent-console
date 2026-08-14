import { NextRequest, NextResponse } from "next/server";
import { consoleAuthMode, sendsUserToken } from "@/lib/identity/mode";
import { IDENTITY_COOKIE, getSession } from "@/lib/identity/session";

/**
 * Who this browser is signed in as — the only thing the console knows about the
 * operator, and deliberately less than the shell would like to show.
 *
 * It carries **no role**, because the console cannot learn one: the platform has
 * no `me` route, and `requireRole` denies at every floor, so "authenticated, any
 * role" is not expressible there (plan 08 D4, filed as a platform issue). Until
 * that lands the console renders every control and lets the platform refuse —
 * which is why a 403 has to read as a permission outcome rather than a fault.
 * When it lands, this route is where the capability manifest arrives.
 *
 * It carries no token either. The ID token stays server-side (D2); what the
 * browser gets is what it would put on screen, and nothing that authorizes
 * anything.
 *
 * A **404 when identity is not configured**, matching `login` and `callback`:
 * on such a deployment this surface does not exist, and the shell reads that as
 * "render no account block" rather than as a failure.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  let actsAsUser = false;
  try {
    actsAsUser = sendsUserToken(consoleAuthMode());
  } catch {
    // A broken identity configuration already makes /api/health answer 503.
    // Here it reads as "no identity", so the shell renders nothing rather than
    // an account block for a deployment that cannot sign anyone in.
    actsAsUser = false;
  }
  if (!actsAsUser) {
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

  const session = getSession(
    request.cookies.get(IDENTITY_COOKIE)?.value,
    Date.now(),
  );
  // Per-browser state that changes on sign-in, sign-out and every pod restart.
  const headers = { "cache-control": "no-store" };
  if (session === undefined) {
    return NextResponse.json({ signed_in: false }, { headers });
  }
  return NextResponse.json(
    {
      signed_in: true,
      ...(session.email === undefined ? {} : { email: session.email }),
      ...(session.name === undefined ? {} : { name: session.name }),
    },
    { headers },
  );
}
