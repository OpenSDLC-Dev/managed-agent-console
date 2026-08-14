import { bounceToLogin, isSignedOut } from "@/lib/identity/signed-out";

/**
 * Browser-side helpers for talking to the platform through the BFF proxy.
 * Everything goes to /api/platform/v1/... — or, for the off-wire console API,
 * /api/oauth/... — never to the platform directly (CLAUDE.md principle 2).
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

/** Files' classic list envelope. */
export interface ClassicPage<T> {
  data: T[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

/**
 * The console API's offset envelope (internal/api/consoleapi.go:92-104) — a
 * third list shape, neither the wire surface's keyset `Page<T>` nor files'
 * `ClassicPage<T>`. It is what the reference console's own listing returns.
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
async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  if (isSignedOut(response)) bounceToLogin();
  const envelope = (await response
    .json()
    .catch(() => null)) as ErrorEnvelope | null;
  throw new PlatformError(response.status, envelope);
}

function queryString(
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
): Promise<T> {
  const response = await fetch(`/api/platform/${path}${queryString(params)}`);
  await assertOk(response);
  return (await response.json()) as T;
}

export async function platformPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/platform/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await assertOk(response);
  return (await response.json()) as T;
}

export async function platformPostForm<T>(
  path: string,
  form: FormData,
): Promise<T> {
  const response = await fetch(`/api/platform/${path}`, {
    method: "POST",
    body: form,
  });
  await assertOk(response);
  return (await response.json()) as T;
}

export async function platformDelete<T>(path: string): Promise<T> {
  const response = await fetch(`/api/platform/${path}`, { method: "DELETE" });
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
    headers: { "content-type": "application/json" },
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
    headers: { "content-type": "application/json" },
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
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  await assertOk(response);
}
