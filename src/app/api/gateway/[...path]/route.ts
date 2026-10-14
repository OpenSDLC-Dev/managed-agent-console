import { NextRequest } from "next/server";
import { modelGatewayBaseUrl } from "@/lib/env";
import { envelope, forward, type Upstream } from "@/lib/platform-proxy";

/**
 * BFF passthrough for the model gateway's admin API
 * (`internal/modelgateway/admin/admin.go` in the platform), plan 10.
 *
 * The gateway is a server of its own, so this route forwards to
 * `MODEL_GATEWAY_BASE_URL` rather than to the control plane. The credential is
 * the one `forward` always sends: the operator's token in identity mode, else
 * `PLATFORM_API_KEY` — which the admin API accepts only when it is the
 * bootstrap key (`authenticate` there refuses every other platform key).
 *
 * Unset, the variable means this deployment runs no gateway the console
 * manages. Every path then answers the platform's own `404 not_found_error`,
 * which is what the surface probe reads as "not implemented" (plan 10
 * decision 5) — so the screens hide instead of erroring.
 *
 * The gate is an allowlist of whole path shapes with their methods, as the
 * console-API route's is, for the reason that route gives: a passthrough is a
 * credential lent to whatever path it forwards.
 */

/** A gateway id: `gwprov_…`, `gwcred_…`, `gwdep_…`, or an api key's id. */
const ID = "[A-Za-z0-9_-]+";

/**
 * A model name, which may hold slashes (`Qwen/Qwen3-Coder`). Segments arrive
 * decoded, so one that would select another path or carry a query — `?`, `#`,
 * `%`, `\` — is refused, as are the dot segments `fetch` would resolve away.
 * The gateway refuses empty and dot segments itself (`checkAliasName`).
 */
const NAME = "[^/?#%\\\\]+(?:/[^/?#%\\\\]+)*";

const READ = ["GET"];
const COLLECTION = ["GET", "POST"];
const ITEM = ["GET", "POST", "DELETE"];

/** Each shape the admin API serves, with the methods `routes()` registers there. */
const SHAPES: [RegExp, string[]][] = [
  [/^profiles$/, READ],
  [/^providers$/, COLLECTION],
  [new RegExp(`^providers/${ID}$`), ITEM],
  [new RegExp(`^providers/${ID}/credentials$`), COLLECTION],
  [new RegExp(`^providers/${ID}/credentials/${ID}$`), ITEM],
  [/^deployments$/, COLLECTION],
  [new RegExp(`^deployments/${ID}$`), ITEM],
  [/^aliases$/, COLLECTION],
  [new RegExp(`^aliases/${NAME}$`), ITEM],
  [/^key_policies$/, READ],
  [new RegExp(`^key_policies/${ID}$`), ITEM],
  [/^usage\/daily$/, READ],
  [/^usage\/requests$/, READ],
];

function allowed(method: string, rest: string): boolean {
  return SHAPES.some(
    ([shape, methods]) => shape.test(rest) && methods.includes(method),
  );
}

const GATEWAY: Upstream = {
  baseUrl: () => {
    const url = modelGatewayBaseUrl();
    if (!url) throw new Error("MODEL_GATEWAY_BASE_URL is not set");
    return url;
  },
  name: "model gateway",
  variable: "MODEL_GATEWAY_BASE_URL",
  endsSessionOn401: false,
};

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const joined = path.join("/");
  if (modelGatewayBaseUrl() === undefined) {
    return envelope(
      404,
      "not_found_error",
      "this console manages no model gateway: MODEL_GATEWAY_BASE_URL is not set",
    );
  }
  const rest = joined.startsWith("admin/v1/")
    ? joined.slice("admin/v1/".length)
    : undefined;
  if (
    rest === undefined ||
    path.some((segment) => segment === "." || segment === "..") ||
    !allowed(request.method, rest)
  ) {
    return envelope(
      404,
      "invalid_request_error",
      `unsupported gateway path "/${joined}"`,
    );
  }
  return forward(request, joined, GATEWAY);
}

export { proxy as GET, proxy as POST, proxy as DELETE };
