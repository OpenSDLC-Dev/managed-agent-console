import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const password = process.env.CONSOLE_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token, password)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        type: "error",
        error: {
          type: "authentication_error",
          message: "console login required",
        },
      },
      { status: 401 },
    );
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except the login page + login endpoint, the health endpoint, and
  // static assets.
  //
  // /api/health is exempt because the caller that needs it cannot hold a
  // session: a Kubernetes readiness probe would read this gate's 401 as an
  // unhealthy container and never mark the pod ready, so on a deployment that
  // set a password nothing could ever go green. The route is written for
  // anonymous callers: it names environment variables and a status code, never
  // a URL and never a key.
  //
  // Its `?deep=1` depth spends the management key against the platform, so it
  // is not safe to leave open here. Rather than split the matcher on a query
  // string, that depth applies the same session check itself — see
  // src/app/api/health/route.ts.
  //
  // The three route tokens are anchored with `$` and the two `_next` prefixes
  // are not, because that is what they are: `/_next/static/…` has a path under
  // it and these routes do not. Unanchored, each would exempt every path that
  // merely *starts* with its name — `/api/healthz`, `/api/logins` — so a route
  // added later would be born outside the gate, silently, on any deployment
  // where this gate is the only thing in front of a management key.
  //
  // `api/auth/` is the deliberate exception to that rule: it is a **prefix**,
  // and everything under it must be reachable unauthenticated by construction.
  // Nobody can hold a session before signing in, so a gated `/api/auth/login`
  // would redirect the browser to `/login`, and a gated `/api/auth/callback`
  // would make the identity provider's redirect land on the password form —
  // the sign-in could never complete on any deployment that also sets
  // CONSOLE_PASSWORD, which is local development, the gated e2e specs and the
  // fidelity run (plan 08 D3's third row). The trailing slash is what keeps
  // this narrow: it exempts paths *under* `/api/auth/`, not a future
  // `/api/authorize`.
  matcher: [
    "/((?!login$|api/login$|api/health$|api/auth/|_next/static|_next/image|favicon.ico).*)",
  ],
};
