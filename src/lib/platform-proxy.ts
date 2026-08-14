import "server-only";
import { NextRequest } from "next/server";
import { platformApiKey, platformBaseUrl } from "@/lib/env";

/**
 * The BFF's forwarding core, shared by the two proxy routes.
 *
 * The console reaches the platform over two namespaces that differ in nothing
 * but their path: `/v1/...` (the wire surface) and `/api/oauth/...` (the
 * off-wire console API plan 30 mirrored from the reference console). Both are
 * management-authenticated and both must inject the key server-side, so the
 * injection, the header allowlists, the streaming and the failure envelopes
 * live here once — a second copy is a second place to forget that an inbound
 * `x-api-key` must never be forwarded.
 *
 * Each route keeps its own path gate. That is deliberate: the gate is the only
 * thing standing between a browser and a management credential, and "one gate
 * that grew a second prefix" is harder to read as correct than two gates that
 * each admit one narrow, enumerated shape.
 */

// Request headers forwarded to the platform (everything else is dropped,
// notably any inbound x-api-key/authorization). anthropic-version/-beta pass
// through for wire-neutrality; the platform accepts and ignores them.
const FORWARD_REQUEST_HEADERS = [
  "content-type",
  "accept",
  "last-event-id",
  "anthropic-version",
  "anthropic-beta",
];

// Response headers passed back to the browser. `cache-control` carries the
// console API's `no-store` on the one route that returns a credential
// (internal/api/consoleapi.go noStore); `pragma` is deliberately not forwarded
// — it is the legacy half of that pair and nothing here reads it.
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "request-id",
  "cache-control",
];

/** The house error envelope, in the shape the platform itself renders. */
export function envelope(
  status: number,
  type: string,
  message: string,
): Response {
  return Response.json({ type: "error", error: { type, message } }, { status });
}

/**
 * Whether a segment would make the request we *send* differ from the path a
 * route's gate approved.
 *
 * Each gate checks a string; `fetch` then reparses the URL we build from it,
 * and WHATWG URL resolution collapses dot segments. So
 * `organizations/../environments/e/tokens` satisfies a shape check and is sent
 * as `environments/e/tokens` — the gate asserts one path and the management
 * credential travels to another. The `/v1` gate is the sharper case: it only
 * inspects the first segment, so `v1/../../x` leaves the wire surface entirely.
 *
 * `%` is refused with them. Next decodes the catch-all once per segment, so a
 * surviving `%` is double-encoded input — and the URL standard resolves
 * `%2e%2e` as `..` too, which means one decoding pass is not enough to see it.
 * No path this console builds carries anything but platform ids, none of which
 * contain a percent sign, so refusing the character costs nothing.
 *
 * Belt-and-braces by design: it lives in the shared core rather than in either
 * gate, so a third route added later inherits it without having to know.
 */
function escapesItsPath(upstreamPath: string): boolean {
  return upstreamPath
    .split("/")
    .some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.includes("%") ||
        segment.includes("\\"),
    );
}

/**
 * Forward `request` to `<PLATFORM_BASE_URL>/<upstreamPath>` with the management
 * key attached. `upstreamPath` is built by the calling route from its own
 * validated path — never from raw user input.
 */
export async function forward(
  request: NextRequest,
  upstreamPath: string,
): Promise<Response> {
  if (escapesItsPath(upstreamPath)) {
    return envelope(
      404,
      "invalid_request_error",
      `unsupported proxy path "/${upstreamPath}"`,
    );
  }

  let baseUrl: string;
  let apiKey: string;
  try {
    baseUrl = platformBaseUrl();
    apiKey = platformApiKey();
  } catch (cause) {
    return envelope(
      500,
      "api_error",
      cause instanceof Error ? cause.message : "console misconfigured",
    );
  }

  const url = `${baseUrl}/${upstreamPath}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-api-key", apiKey);

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
    return envelope(
      502,
      "api_error",
      "platform unreachable — check PLATFORM_BASE_URL",
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
