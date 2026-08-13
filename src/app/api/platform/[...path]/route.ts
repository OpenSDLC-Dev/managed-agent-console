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

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const joined = path.join("/");
  if (path[0] !== "v1") {
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
