import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  isHttpsRequest,
  isValidSession,
  sessionTokenFor,
} from "@/lib/auth";
import { consolePassword } from "@/lib/env";

export async function POST(request: NextRequest) {
  const password = consolePassword();
  if (!password) {
    // No gate configured — nothing to log in to.
    return NextResponse.json({ ok: true, gate: false });
  }
  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;
  // Comparing HMACs of the two passwords keeps the check constant-time.
  const matches =
    !!body?.password &&
    (await isValidSession(await sessionTokenFor(body.password), password));
  if (!matches) {
    return NextResponse.json(
      {
        type: "error",
        error: { type: "authentication_error", message: "wrong password" },
      },
      { status: 401 },
    );
  }
  const response = NextResponse.json({ ok: true, gate: true });
  // `SameSite=Lax` is stated rather than inherited: this cookie authorizes the
  // BFF, which forwards POST and DELETE to the platform, so `None` would make
  // every mutation reachable cross-site and `Strict` would break the redirect
  // back from an identity provider (plan 08 slice 2). Lax is the one that is
  // both — and it is a floor, not the whole defence: a cookie-authenticated
  // proxy still owes an origin check on mutations, which lands with the
  // forwarding change in slice 3.
  response.cookies.set(SESSION_COOKIE, await sessionTokenFor(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
