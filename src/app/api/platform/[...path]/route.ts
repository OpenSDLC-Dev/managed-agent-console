import { NextRequest } from "next/server";
import { platformApiKey, platformBaseUrl } from "@/lib/env";

/**
 * BFF proxy: the browser talks only to this route; the platform management
 * key is injected here and never reaches the client (CLAUDE.md principle 2).
 * Responses are streamed through untouched — SSE depends on this.
 */

// Request headers forwarded to the platform (everything else is dropped,
// notably any inbound x-api-key/authorization).
const FORWARD_REQUEST_HEADERS = ["content-type", "accept", "last-event-id"];

// Response headers passed back to the browser.
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "request-id",
  "cache-control",
];

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const joined = path.join("/");
  if (path[0] !== "v1") {
    return Response.json(
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: `unsupported proxy path "/${joined}"`,
        },
      },
      { status: 404 },
    );
  }

  const url = `${platformBaseUrl()}/${joined}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-api-key", platformApiKey());

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Node fetch requires half-duplex for streamed request bodies.
      ...(hasBody ? { duplex: "half" as const } : {}),
      redirect: "manual",
      // SSE streams stay open indefinitely.
      signal: request.signal,
    });
  } catch {
    return Response.json(
      {
        type: "error",
        error: {
          type: "api_error",
          message: "platform unreachable — check PLATFORM_BASE_URL",
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as DELETE,
  proxy as PUT,
  proxy as PATCH,
};
