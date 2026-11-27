import { NextRequest, NextResponse } from "next/server";
import { pathWorkspace, validWorkspace } from "@/lib/platform/tenancy";

const privateHeaders = { "Cache-Control": "private, no-store" };

function missing() {
  return new NextResponse(
    "<!doctype html><html lang=en><title>Workspace not found</title><main><h1>404</h1><p>Workspace not found.</p></main></html>",
    {
      status: 404,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

function login(request: NextRequest) {
  const path = request.nextUrl.pathname + request.nextUrl.search;
  return new NextResponse(null, {
    status: 307,
    headers: {
      ...privateHeaders,
      location: "/login?" + new URLSearchParams({ return_to: path }),
    },
  });
}

/** Check membership before Next starts streaming a workspace page. */
export async function proxy(request: NextRequest) {
  const space = pathWorkspace(request.nextUrl.pathname);
  if (!space || !validWorkspace(space)) return missing();
  if (space === "default") return NextResponse.next();
  const origin = process.env.CONSOLE_CONTROLPLANE_URL;
  const unavailable = () =>
    new NextResponse("Workspace service unavailable", {
      status: 503,
      headers: privateHeaders,
    });
  if (!origin) return unavailable();
  const cookie = request.cookies.get("map_session");
  if (!cookie) return login(request);
  try {
    const response = await fetch(new URL("/api/auth/session", origin), {
      headers: {
        cookie: "map_session=" + cookie.value,
        "x-workspace-id": space,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) return login(request);
    if (response.status === 403 || response.status === 404) return missing();
    if (!response.ok) return unavailable();
    const session = await response.json();
    return session.signed_in &&
      session.workspace_id === space &&
      session.workspace_role
      ? NextResponse.next({ headers: privateHeaders })
      : missing();
  } catch {
    return unavailable();
  }
}

export const config = { matcher: "/workspaces/:path*" };
