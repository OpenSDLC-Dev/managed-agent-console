import { bounceToLogin, isSignedOut } from "@/lib/identity/signed-out";

/**
 * Browser transports share one runtime-selected resource lane. Legacy calls
 * use credential BFFs; native calls use cookie-authenticated edge-owned routes.
 * Neither lane exposes a management key or provider token to JavaScript.
 */

export interface ErrorEnvelope {
  type: "error";
  request_id?: string;
  error: { type: string; message: string };
}

export class PlatformError extends Error {
  readonly status: number;
  readonly errorType: string;
  readonly requestId?: string;

  constructor(status: number, envelope: ErrorEnvelope | null) {
    super(envelope?.error.message ?? `HTTP ${status}`);
    this.status = status;
    this.errorType = envelope?.error.type ?? "api_error";
    this.requestId = envelope?.request_id;
  }
}

/** Keyset-cursor list envelope; sessions additionally carry prev_page. */
export interface Page<T> {
  data: T[];
  next_page?: string | null;
  prev_page?: string | null;
}

/**
 * The console API's offset envelope (internal/api/consoleapi.go:92-104) — a
 * separate list shape from the wire surface's keyset `Page<T>`. It is what
 * the reference console's own listing returns.
 */
export interface OffsetPage<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

/**
 * Throws `PlatformError` unless the response is 2xx.
 *
 * A response the BFF marked as signed-out also sends the browser to the login
 * page. It still throws: the navigation is asynchronous, and a caller left
 * waiting on a promise that never settles would render a spinner over the whole
 * departure.
 */
export async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  if (isSignedOut(response)) bounceToLogin();
  const envelope = (await response
    .json()
    .catch(() => null)) as ErrorEnvelope | null;
  throw new PlatformError(response.status, envelope);
}

export function queryString(
  params?: Record<string, string | number | boolean | string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, String(value));
    }
  }
  return search.size > 0 ? `?${search.toString()}` : "";
}

export async function platformGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
  signal?: AbortSignal,
  // Only the `anthropic-*` headers the BFF forwards (platform-proxy.ts).
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetch(
    `${resourceURL(path)}${queryString(params)}`,
    signal || headers ? { signal, headers } : undefined,
  );
  await assertOk(response);
  return (await response.json()) as T;
}

export async function platformPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(resourceURL(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...(await csrfHeaders()) },
    body: JSON.stringify(body),
  });
  await assertOk(response);
  return (await response.json()) as T;
}

/** File content is bytes, not a JSON envelope (internal/api/files.go:downloadFile). */
export async function platformGetText(path: string): Promise<string> {
  const response = await fetch(resourceURL(path));
  await assertOk(response);
  return response.text();
}

export async function platformPostForm<T>(
  path: string,
  form: FormData,
): Promise<T> {
  const response = await fetch(resourceURL(path), {
    method: "POST",
    ...(isNativeConsole() ? { headers: await csrfHeaders() } : {}),
    body: form,
  });
  await assertOk(response);
  return (await response.json()) as T;
}

export async function platformDelete<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
): Promise<T> {
  const response = await fetch(`${resourceURL(path)}${queryString(params)}`, {
    method: "DELETE",
    ...(isNativeConsole() ? { headers: await csrfHeaders() } : {}),
  });
  await assertOk(response);
  return (await response.json()) as T;
}

// ---- the console API (`/api/oauth/...`), plan 07
//
// Separate helpers rather than a base-path parameter on the four above: the two
// namespaces are different contracts, not one contract with a variable prefix,
// and a call site that can silently swap between them is a call site that can
// send a console body to a wire route.

export async function consoleGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
): Promise<T> {
  const response = await fetch(`/api/oauth/${path}${queryString(params)}`);
  await assertOk(response);
  return (await response.json()) as T;
}

export async function consolePost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/oauth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await csrfHeaders()) },
    body: JSON.stringify(body),
  });
  await assertOk(response);
  return (await response.json()) as T;
}

/**
 * A POST whose success is a bodiless 204 — the shape the revoke route answers
 * (`internal/api/server.go:132` registers it through `handleNoContent`).
 *
 * The `platform*` helpers all parse a JSON body on success, which is correct
 * for every `/v1` route the console calls and wrong here: `response.json()` on
 * an empty body throws, so a *successful* revoke would surface as an error
 * toast. Nothing in the console hit a 204 before this.
 */
// ---- the management-key surface (`/api/console/...`), plan 07 slice 4
//
// A third namespace, and a third pair of helpers for the reason the pair above
// gives. The platform serves its key management under `/api/console/` rather
// than plan 30's `/api/oauth/` — "the reference uses both, and each surface
// keeps the one it was observed under" (`internal/api/consoleapikeys.go`) — so
// the two prefixes are not a parameter of one contract. Named for the resource
// rather than the prefix, because `consoleGet` and a hypothetical
// `consoleApiGet` would be one typo apart and land a body on the wrong surface.

export async function consoleKeysGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/console/${path}`);
  await assertOk(response);
  return (await response.json()) as T;
}

export async function consoleKeysPost<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`/api/console/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await csrfHeaders()) },
    body: JSON.stringify(body),
  });
  await assertOk(response);
  return (await response.json()) as T;
}

export async function consolePostNoContent(
  path: string,
  body?: unknown,
): Promise<void> {
  const response = await fetch(`/api/oauth/${path}`, {
    method: "POST",
    ...(isNativeConsole() ? { headers: await csrfHeaders() } : {}),
    ...(body === undefined
      ? {}
      : {
          headers: {
            "content-type": "application/json",
            ...(await csrfHeaders()),
          },
          body: JSON.stringify(body),
        }),
  });
  await assertOk(response);
}

// ---- the model gateway's admin API (`/api/gateway/...`), plan 10
//
// A fourth namespace on a server of its own, so a fourth set of helpers for the
// reason the console-API pair gives. Paths are relative to `admin/v1/`, the
// only prefix the gateway route forwards. Every route, deletes included,
// answers a JSON body (`internal/modelgateway/admin/admin.go` route), so no
// 204 variant is needed.
//
// A model name may hold any character but whitespace (`checkAliasName`), so
// each `/`-delimited part of a path is encoded here, before the browser parses
// the URL: a raw `?` or `#` would otherwise end the path, and a delete for
// `aliases/a?b` would reach `aliases/a` (PR #215 review). Slashes stay
// separators; a name's own slashes are the gateway's separators too.

const gatewayUrl = (path: string) =>
  `${isNativeConsole() ? "" : "/api/gateway"}/admin/v1/${path.split("/").map(encodeURIComponent).join("/")}`;

export async function gatewayGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
): Promise<T> {
  const response = await fetch(`${gatewayUrl(path)}${queryString(params)}`);
  await assertOk(response);
  return (await response.json()) as T;
}

/**
 * JSON has no Infinity or NaN, and JSON.stringify writes either as null,
 * which the gateway reads as "unset" or "no limit": "1e309" typed as a rate
 * limit would lift it. So such a body is not sent at all. The gateway forms'
 * number fields are text inputs for the same reason: a number input hands
 * the page "" for text it cannot parse, and "" reads as unset.
 */
const finiteJson = (body: unknown) =>
  JSON.stringify(body, (key, value) => {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`${key} is not a number the gateway can take.`);
    return value;
  });

/**
 * The operator's text as a whole number for an integer field, or NaN, which
 * gatewayPost refuses. Number reads more than the decimal digits typed:
 * "0x10" is 16, "1.0000000000000001" is 1, and one past 2^53 rounds to
 * another integer. Each is a value the gateway would store though nobody
 * typed it. A fraction passes, for the gateway to refuse.
 */
export const wireInteger = (text: string) => {
  const n = Number(text);
  if (/^\s*[-+]?\d+\s*$/.test(text)) return Number.isSafeInteger(n) ? n : NaN;
  return Number.isInteger(n) ? NaN : n;
};

/**
 * The operator's text as a number for a decimal field, or NaN, which
 * gatewayPost refuses. Only decimal notation passes: Number reads "0x10" as 16.
 */
export const wireDecimal = (text: string) =>
  /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(text)
    ? Number(text)
    : NaN;

export async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(gatewayUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...(await csrfHeaders()) },
    body: finiteJson(body),
  });
  await assertOk(response);
  return (await response.json()) as T;
}

export async function gatewayDelete<T>(path: string): Promise<T> {
  const response = await fetch(gatewayUrl(path), {
    method: "DELETE",
    ...(isNativeConsole() ? { headers: await csrfHeaders() } : {}),
  });
  await assertOk(response);
  return (await response.json()) as T;
}

/** Request-time mode stamped by the server, never a build-frozen public env. */
export function isNativeConsole(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.consoleAuth === "platform"
  );
}

/** The only resource lane selector, shared by JSON, bytes, downloads and SSE. */
export function resourceURL(path: string): string {
  return `${isNativeConsole() ? "/api/organizations/default/proxy" : "/api/platform"}/${path}`;
}

/** Read metadata only. The browser owns the opaque HttpOnly cookie. */
export async function csrfHeaders(
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  if (!isNativeConsole()) return {};
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  await assertOk(response);
  const session = (await response.json()) as { csrf_token?: string };
  if (!session.csrf_token)
    throw new Error("The platform session has no CSRF token.");
  return { "X-CSRF-Token": session.csrf_token };
}

/** Downloads must observe sign-out markers too; anchors cannot inspect headers. */
export async function downloadResource(
  path: string,
  filename: string,
): Promise<void> {
  const response = await fetch(resourceURL(path));
  await assertOk(response);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
