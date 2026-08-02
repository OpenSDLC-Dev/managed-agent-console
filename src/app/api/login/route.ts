import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession, sessionTokenFor } from "@/lib/auth";
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
  response.cookies.set(SESSION_COOKIE, await sessionTokenFor(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
