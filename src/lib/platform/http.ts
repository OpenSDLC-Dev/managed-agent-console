/**
 * Browser-side helpers for talking to the platform through the BFF proxy.
 * Everything goes to /api/platform/v1/... — never to the platform directly
 * (CLAUDE.md principle 2).
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

export async function platformGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetch(`/api/platform/${path}${query}`);
  if (!response.ok) {
    const envelope = (await response
      .json()
      .catch(() => null)) as ErrorEnvelope | null;
    throw new PlatformError(response.status, envelope);
  }
  return (await response.json()) as T;
}
