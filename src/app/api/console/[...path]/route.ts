import { NextRequest } from "next/server";
import { envelope, forward } from "@/lib/platform-proxy";

/**
 * BFF passthrough for the platform's **management-key console routes**
 * (`internal/api/consoleapikeys.go`), plan 07 slice 4.
 *
 * A second console namespace rather than a branch of the first: the platform
 * serves these under `/api/console/` and plan 30's environment keys under
 * `/api/oauth/`, because "the reference uses both, and each surface keeps the
 * one it was observed under". Mounting each under the reference's own prefix
 * keeps the console's URL identical to the reference's, which is what makes a
 * recording a check rather than a translation.
 *
 * Same allowlist discipline, for the same reason: a passthrough that forwards
 * whatever the browser composes is a management credential lent to an arbitrary
 * upstream path. Here that matters more than on either neighbour — every route
 * below is admin-only on the platform, and this is the surface that mints the
 * credential the console itself runs on.
 */

/** As on the sibling namespace: ids and tenancy handles, no dots, no percent. */
const ID = "[A-Za-z0-9_-]+";

/** `organizations/{org}/workspaces/{workspace}/api_keys` */
const KEYS = new RegExp(`^organizations/${ID}/workspaces/${ID}/api_keys$`);
/** `organizations/{org}/workspaces/{workspace}/api_keys/{key_id}` */
const KEY = new RegExp(`^organizations/${ID}/workspaces/${ID}/api_keys/${ID}$`);

/**
 * Method is part of the shape. The platform registers GET+POST on the
 * collection and POST on the item — no DELETE anywhere, because retiring a key
 * is `status: archived` rather than a verb (the reference's own dialect, whose
 * DELETE answers 405).
 */
function allowed(method: string, joined: string): boolean {
  if (KEYS.test(joined)) return method === "GET" || method === "POST";
  if (KEY.test(joined)) return method === "POST";
  return false;
}

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  // Joined before matching: an encoded slash arrives decoded and shows up only
  // as an extra `/` here, where a whole-shape match rejects it.
  const joined = path.join("/");
  if (!allowed(request.method, joined)) {
    return envelope(
      404,
      "invalid_request_error",
      `unsupported console path "/api/console/${joined}"`,
    );
  }
  return forward(request, `api/console/${joined}`);
}

export { proxy as GET, proxy as POST };
