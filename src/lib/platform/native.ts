import { pathWorkspace, selectedOptions, workspaceHeaders } from "./tenancy";
import { assertOk, csrfHeaders, queryString } from "./http";

export type Role = "user" | "developer" | "admin" | "billing";
export type WorkspaceRole = Role | "limited_developer";
export type AuthConfig = {
  mode: "disabled" | "password" | "oidc" | "trusted_proxy";
  native_login: boolean;
};
export type NativeSession = {
  signed_in: true;
  workspace_id?: string;
  workspace_name?: string;
  workspace_selection_required?: boolean;
  workspace_role?: WorkspaceRole;
  id: string;
  role: Role;
  role_source: string;
  platform_version?: string;
  playground_access?: boolean;
  email: string;
  name: string;
  login_name?: string;
  expires_at: string;
  csrf_token: string;
};
export type Member = {
  id: string;
  type: "user";
  added_at: string;
  email: string;
  name: string;
  role: Role;
  role_source: string;
  status: string;
  playground_access?: boolean;
  login_name?: string;
};
export type MemberPage = {
  data: Member[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
};
export type ServiceAccount = {
  id: string;
  type: "service_account";
  name: string;
  description: string | null;
  organization_role: "developer" | "admin";
  created_at: string;
  created_by_actor_id: string | null;
  updated_at: string;
  updated_by_actor_id: string | null;
  archived_at: string | null;
  archived_by_actor_id: string | null;
};
export type ServiceAccountPage = {
  data: ServiceAccount[];
  next_page: string | null;
};
export const ORGANIZATION = "/api/console/organizations/default";

export async function nativeGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${path}${queryString(params)}`, {
    cache: "no-store",
    ...selectedOptions(),
    ...(signal && { signal }),
  });
  await assertOk(response);
  return response.json() as Promise<T>;
}

/** Secrets stay in the caller's transient form, never a Query mutation cache. */
export async function nativeWrite<T>(
  path: string,
  body?: unknown,
  method = "POST",
  anonymous = false,
  expectedPrincipalId?: string,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(anonymous ? {} : await csrfHeaders({ expectedPrincipalId })),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  await assertOk(response);
  return response.json() as Promise<T>;
}

/** Optional only on the anonymous setup page. A missing cookie is expected. */
export async function setupSession(): Promise<NativeSession | null> {
  const selected =
    typeof window !== "undefined" &&
    (pathWorkspace(window.location.pathname) ||
      new URLSearchParams(window.location.search).has("workspace"));
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    ...(selected && { headers: workspaceHeaders() }),
  });
  if (response.status === 401) return null;
  await assertOk(response);
  return response.json() as Promise<NativeSession>;
}

export function passwordProblem(password: string): string | undefined {
  const bytes = new TextEncoder().encode(password).length;
  return bytes < 12 || bytes > 1024 || password.includes("\0")
    ? "Use a password of 12–1024 UTF-8 bytes, without NUL."
    : undefined;
}

export function enterConsole(): void {
  // Full navigation drops the previous identity's Query caches and streams.
  const target = new URLSearchParams(window.location.search).get("return_to");
  const url = new URL("/", window.location.origin);
  if (
    target?.startsWith("/") &&
    !target.startsWith("//") &&
    !target.includes("\\")
  ) {
    const requested = new URL(target, url);
    if (requested.origin === url.origin && pathWorkspace(requested.pathname)) {
      window.location.assign(requested.href);
      return;
    }
  }
  window.location.assign(url.href);
}

export async function readAccount(): Promise<
  (Partial<NativeSession> & { signed_in: boolean }) | null
> {
  const selected =
    typeof window !== "undefined" &&
    (pathWorkspace(window.location.pathname) ||
      new URLSearchParams(window.location.search).has("workspace"));
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    ...(selected && { headers: workspaceHeaders() }),
  });
  await assertOk(response);
  const session = (await response.json()) as
    (Partial<NativeSession> & { signed_in: boolean }) | null;
  if (
    session &&
    response.headers.get("x-platform-playground-disabled") === "1"
  ) {
    delete session.playground_access;
  }
  return session;
}
