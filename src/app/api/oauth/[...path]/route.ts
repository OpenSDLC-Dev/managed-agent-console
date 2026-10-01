import { NextRequest } from "next/server";
import { envelope, forward } from "@/lib/platform-proxy";
import { CONSOLE_ORG } from "@/lib/platform/tenancy";

/**
 * BFF passthrough for the platform's **console API** — the off-wire namespace
 * plan 30 mirrored segment-for-segment from the reference console's private API
 * (`internal/api/consoleapi.go:39-48`). Mounting it here, under the same path
 * the reference uses, means the console's own URL is the reference's URL
 * verbatim: `<console>/api/oauth/organizations/default/environments/{id}/tokens`.
 *
 * The management key is injected in `forward` and never reaches the browser,
 * exactly as on the `/v1` proxy (CLAUDE.md principle 2).
 *
 * **`/api/auth/…` is reserved for console OIDC (plan 08) and must never be
 * served from here** — that namespace is the console's own login, this one is a
 * proxy to the platform, and collapsing them would put a login route behind a
 * credential-injecting passthrough.
 *
 * The gate below is an **allowlist of whole path shapes**, not a prefix test.
 * A passthrough that forwards whatever the browser asks for is a management
 * credential lent to arbitrary upstream paths; the platform's namespace may
 * grow routes this console has no business reaching, and this gate is where
 * that stays true without anyone having to notice.
 */

/**
 * What an id may be made of. Deliberately narrower than "not a slash": every
 * value that lands in these slots is a platform id (`env_…`, `envkey_…`), and
 * none needs a dot or a percent sign. Excluding both is what stops `..` and
 * `%2e%2e` from satisfying the shapes below and then being resolved away when
 * `fetch` reparses the URL. `forward` refuses them again for any route that
 * forgets.
 */
const ID = "[A-Za-z0-9_-]+";

/**
 * The organization is not an id slot: it is pinned to the one this console
 * manages. The platform answers a foreign organization UUID with a 401
 * `authentication_error`, as the reference was recorded doing
 * (managed-agent-platform#820), and `forward` reads any upstream 401 as the
 * operator's own token refused — it ends the session and clears the cookie.
 * That cookie is `SameSite=Lax`, so a cross-site link to this route naming any
 * UUID would sign an operator out. Refused here, before anything is forwarded,
 * such a path is a 404 that leaves the session alone.
 */
const ORG = `organizations/${CONSOLE_ORG}`;

/** `organizations/default/environments/{env}/tokens` */
const TOKENS = new RegExp(`^${ORG}/environments/${ID}/tokens$`);
/** `organizations/default/environments/{env}/tokens/{token}/revoke` */
const REVOKE = new RegExp(`^${ORG}/environments/${ID}/tokens/${ID}/revoke$`);

/**
 * Method is part of the shape: the platform serves GET+POST on the collection
 * and POST on revoke, and nothing else. A DELETE that the platform would answer
 * 405 for should not consume a forwarded credential to find that out.
 */
function allowed(method: string, joined: string): boolean {
  if (TOKENS.test(joined)) return method === "GET" || method === "POST";
  if (REVOKE.test(joined)) return method === "POST";
  return false;
}

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  // Checked after joining, because a segment carrying an encoded slash arrives
  // decoded and only shows up as an extra `/` here — where the whole-shape
  // match rejects it. A segment that is itself `..` does *not* show up that
  // way, which is what the charset in ID is for.
  const joined = path.join("/");
  if (!allowed(request.method, joined)) {
    return envelope(
      404,
      "invalid_request_error",
      `unsupported console path "/api/oauth/${joined}"`,
    );
  }
  return forward(request, `api/oauth/${joined}`);
}

export { proxy as GET, proxy as POST };
