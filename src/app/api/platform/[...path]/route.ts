import { NextRequest } from "next/server";
import { envelope, forward } from "@/lib/platform-proxy";

/**
 * BFF proxy for the platform's `/v1` wire surface: the browser talks only to
 * this route; the management key is injected in `forward` and never reaches the
 * client (CLAUDE.md principle 2). Responses are streamed through untouched —
 * SSE depends on this.
 *
 * The console API's own namespace has its own route and its own gate, at
 * `src/app/api/oauth/[...path]/route.ts`.
 */

/**
 * Whether `path` is under the work API, `v1/environments/{id}/work…`.
 *
 * That is a worker's surface: the platform's dispatcher authenticates every
 * request there as an environment key (`internal/api/server.go` dispatchAuth,
 * isWorkPath), so the operator's own token is a 401 there, and `forward` reads
 * a 401 as that token refused and ends the session. A link from any site can
 * aim this proxy at the path, and the identity cookie is `SameSite=Lax`, so it
 * would sign an operator out. The console never calls the work API, so the
 * subtree is refused here instead. It is the only `/v1` path that answers an
 * authenticated operator 401: everywhere else the platform verifies the token
 * itself, and refuses a role with 403 (managed-agent-platform#820).
 *
 * Segments arrive decoded, so an encoded spelling (`%77ork`) is caught too.
 */
function isWorkApi(path: string[]): boolean {
  return path[1] === "environments" && path[3] === "work";
}

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const joined = path.join("/");
  // Next decodes each segment. A decoded delimiter must not select another
  // upstream endpoint or become a query/fragment when joined below.
  if (
    path[0] !== "v1" ||
    path.some((segment) => /[/?#]/.test(segment)) ||
    isWorkApi(path)
  ) {
    return envelope(
      404,
      "invalid_request_error",
      `unsupported proxy path "/${joined}"`,
    );
  }
  return forward(request, joined);
}

export {
  proxy as GET,
  proxy as POST,
  proxy as DELETE,
  proxy as PUT,
  proxy as PATCH,
};
