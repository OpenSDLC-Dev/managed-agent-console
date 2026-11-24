"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useContext, useSyncExternalStore } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { PlatformError, consoleKeysGet, gatewayGet, platformGet } from "./http";
import { nativeGet, ORGANIZATION, type NativeSession } from "./native";
import { isPermissionDenied } from "./denied";
import { CONSOLE_ORG, CONSOLE_WORKSPACE } from "./tenancy";
import {
  AGENTS_OVERVIEW_ROUTE,
  isAgentsWorkspacePage,
  MESSAGES_ROUTE,
  RESOURCES_ROUTE,
  playgroundOnly,
} from "@/lib/routes";

/**
 * Feature detection follows harness/rules/platform-contract.md for surfaces
 * a deployment does not serve.
 *
 * The platform has no "not implemented" status — there is no 501 anywhere in
 * it. An unregistered route falls through the router's catch-all and answers
 * with the same envelope a missing resource gets: 404, `not_found_error`,
 * only the message differing (`managed-agent-platform`
 * `internal/api/server.go`; verified against a running stack for issue #33).
 * So the response alone cannot separate "this endpoint is absent" from "this
 * id is gone".
 *
 * The *route* can. A collection path carries no id that could be missing, so
 * a 404 there can only mean the endpoint is absent — none of the platform's
 * list handlers has a 404 path. That is the whole rule, and it holds only for
 * the collection routes below: on an item route a 404 is a genuine not-found
 * and stays an error.
 */
/** The collection read determines which resource links the shell can offer. */
export const SURFACES = {
  members: {
    path: `${ORGANIZATION}/members`,
    label: "Members",
    blurb: "People and their organization roles.",
    api: "native",
  },
  "service-accounts": {
    path: `${ORGANIZATION}/service_accounts`,
    label: "Service accounts",
    blurb: "Non-human organization accounts.",
    api: "native",
  },
  agents: {
    path: "v1/agents",
    label: "Agents",
    blurb: "Create and manage autonomous agents.",
  },
  sessions: {
    path: "v1/sessions",
    label: "Sessions",
    blurb: "Trace and debug agent sessions.",
  },
  deployments: {
    path: "v1/deployments",
    label: "Deployments",
    blurb: "Run agents manually or on recurring schedules.",
  },
  "memory-stores": {
    path: "v1/memory_stores",
    label: "Memory Stores",
    blurb: "Durable files shared across agent sessions.",
  },
  dreams: {
    path: "v1/dreams",
    label: "Dreams",
    blurb: "Consolidate session transcripts into durable memory.",
  },
  environments: {
    path: "v1/environments",
    label: "Environments",
    blurb: "Configuration templates for session sandboxes.",
  },
  vaults: {
    path: "v1/vaults",
    label: "Credential Vaults",
    blurb: "Credentials your agents use for MCP servers and other tools.",
  },
  skills: {
    path: "v1/skills",
    label: "Skills",
    blurb: "Packaged instructions and scripts agents load on demand.",
  },
  files: {
    path: "v1/files",
    label: "Files",
    blurb:
      "Uploads available as session mounts. A session lists its own files.",
  },
  // Management keys live in the platform's private console namespace.
  // The rule above still holds and for the same reason — this is
  // a collection route whose only variable segments are constants this console
  // sends, so a 404 cannot be about a missing id.
  // Developers can read their owned keys. A user's 403 hides navigation;
  // direct routes still explain the platform's refusal.
  "api-keys": {
    path: `organizations/${CONSOLE_ORG}/workspaces/${CONSOLE_WORKSPACE}/api_keys`,
    label: "API Keys",
    api: "console",
    blurb: "Management credentials for this deployment.",
  },
  // The model gateway's admin API (plan 10), a server of its own reached
  // through the application edge. The rule above holds there too: the edge
  // preserves the gateway's `404 not_found_error` for paths it does not
  // serve (`internal/modelgateway/admin/admin.go` routes). A collection
  // route carries no id, so its 404 means the surface is absent.
  models: {
    path: "aliases",
    label: "Models",
    api: "gateway",
    blurb:
      "The names agents and applications send. Each routes to upstream models on your providers.",
  },
  providers: {
    path: "providers",
    label: "Providers",
    api: "gateway",
    blurb:
      "Vendor accounts the gateway calls, with their keys and upstream models.",
  },
  // Probed through the ledger at one row: the daily read answers 30 days of
  // rollups, up to 50,000 of them (usage.go maxDailyRows).
  usage: {
    path: "usage/requests",
    label: "Usage",
    api: "gateway",
    query: { limit: 1 },
    blurb: "Model calls through the gateway: requests, tokens and cost.",
  },
} as const;

export type Surface = keyof typeof SURFACES;

export const SURFACE_NAMES = Object.keys(SURFACES) as Surface[];

/** The console route a surface owns, list page and everything under it. */
export const surfaceRoute = (surface: Surface) => `/${surface}`;

/** The surface a console path belongs to, if any: `/skills/skill_1` → skills. */
export function surfaceOfPath(pathname: string): Surface | undefined {
  const segment = pathname.split("/")[1];
  return SURFACE_NAMES.find((name) => name === segment);
}

/**
 * Whether `error` — raised by a query on one of the {@link SURFACES}
 * collection routes — means this deployment does not implement that surface.
 * Passing an item route's error here would misread a dead resource as a
 * missing endpoint.
 */
export function isUnimplemented(error: unknown): boolean {
  if (!(error instanceof PlatformError)) return false;
  // 501 says it outright, whatever the route — the platform never sends one,
  // but principle 3 names it and another wire-compatible endpoint may.
  if (error.status === 501) return true;
  // A 404 is ambiguous by status alone; the collection-route discipline above
  // is what disambiguates it. Requiring the platform's own error type keeps an
  // intermediary's bare 404 — an HTML page from a proxy, which parses to no
  // envelope and so falls back to api_error — from hiding a live surface.
  return error.status === 404 && error.errorType === "not_found_error";
}

export type SurfaceState =
  | { status: "available" | "unimplemented" | "unknown" }
  | { status: "denied"; error: PlatformError };

type SurfaceStates = Record<Surface, SurfaceState> & {
  agentsOverview?: SurfaceState;
};
export const agentsReportAccessKey = (
  session?: Partial<NativeSession> | null,
) =>
  [
    "agents-report-access",
    session?.id,
    session?.role,
    session?.platform_version,
  ] as const;

/** Each overview is available if at least one of its collections can be read. */
export function reportSurfaceState(
  pathname: string,
  surfaces: SurfaceStates | undefined,
): SurfaceState | undefined {
  if (!surfaces) return undefined;
  if (isAgentsWorkspacePage(pathname)) {
    if (
      pathname === AGENTS_OVERVIEW_ROUTE &&
      surfaces.agents.status === "available"
    )
      return surfaces.agentsOverview ?? surfaces.agents;
    return surfaces.agents;
  }
  const reads =
    pathname === RESOURCES_ROUTE
      ? [surfaces.files, surfaces.skills]
      : pathname === MESSAGES_ROUTE
        ? [surfaces.usage, surfaces["api-keys"]]
        : [surfaces.usage];
  return (
    reads.find((read) => read.status === "available") ??
    reads.find((read) => read.status === "unknown") ??
    reads.find((read) => read.status === "denied") ??
    reads[0]
  );
}

/** A failed Resources probe leaves the real collection read to decide access. */
export function canOpenReport(
  pathname: string,
  surfaces: SurfaceStates | undefined,
) {
  const status = reportSurfaceState(pathname, surfaces)?.status;
  return (
    status === "available" ||
    ((pathname === RESOURCES_ROUTE || isAgentsWorkspacePage(pathname)) &&
      status === "unknown")
  );
}

export function hasDeveloperSession(session?: Partial<NativeSession> | null) {
  return (
    session?.signed_in === true &&
    Boolean(session.id) &&
    (session.role === "admin" || session.role === "developer")
  );
}

/** Hide only confirmed absence or a refused collection read, never uncertainty. */
export function isSurfaceVisible(
  state: SurfaceState | undefined,
  surface?: Surface,
): boolean {
  // Human-only administration never flashes open while admission is unknown.
  if (
    surface &&
    "api" in SURFACES[surface] &&
    SURFACES[surface].api === "native"
  )
    return state?.status === "available";
  return (
    state === undefined ||
    state.status === "available" ||
    state.status === "unknown"
  );
}

/**
 * Collection reads, probed once per session in parallel. A permission_error
 * keeps its refusal for direct routes; it never means the feature is absent.
 * Resource admission consumes the collection answer, not a promise of writes.
 * Native admin directories additionally use the current platform session role.
 * Network, intermediary and 5xx failures stay visible and error on the page.
 */
export function useSurfaces(): SurfaceStates | undefined {
  const session = useContext(ConsoleSessionContext)?.data;
  // The aggregate report can be expensive. Discover it on use, independently
  // of the lightweight collection probes, and forget the result on upgrades.
  const client = useQueryClient();
  const subscribe = useCallback(
    (notify: () => void) => client.getQueryCache().subscribe(notify),
    [client],
  );
  const report = useSyncExternalStore(
    subscribe,
    () => client.getQueryData<SurfaceState>(agentsReportAccessKey(session)),
    () => undefined,
  );
  const collections = useQuery({
    queryKey: ["surfaces", session?.id, session?.role],
    enabled: !playgroundOnly(session),
    queryFn: async () => {
      const probes = SURFACE_NAMES.map(
        async (surface): Promise<[Surface, SurfaceState]> => {
          const entry = SURFACES[surface];
          try {
            // The console namespace serves a bare array and reads no query
            // params, so it is asked for the whole (short) list rather than for
            // a page of one. The gateway's lists are unpaged too.
            if ("api" in entry && entry.api === "native") {
              // The backend session supplies current authority. Never fetch
              // admin directories merely to enrich a developer's key form.
              if (session?.role && session.role !== "admin")
                return [
                  surface,
                  {
                    status: "denied",
                    error: new PlatformError(403, {
                      type: "error",
                      error: {
                        type: "permission_error",
                        message: "This directory requires the admin role.",
                      },
                    }),
                  },
                ];
              await nativeGet(entry.path, { limit: 1 });
            } else if (!("api" in entry))
              await platformGet<unknown>(entry.path, { limit: 1 });
            else if (entry.api === "gateway")
              await gatewayGet<unknown>(
                entry.path,
                "query" in entry ? entry.query : undefined,
              );
            else await consoleKeysGet<unknown>(entry.path);
            return [surface, { status: "available" }];
          } catch (error) {
            if (
              error instanceof PlatformError &&
              (isPermissionDenied(error) ||
                (surface === "service-accounts" &&
                  (error.status === 401 || error.status === 403)))
            )
              return [surface, { status: "denied", error }];
            return [
              surface,
              { status: isUnimplemented(error) ? "unimplemented" : "unknown" },
            ];
          }
        },
      );
      return Object.fromEntries(await Promise.all(probes)) as Record<
        Surface,
        SurfaceState
      >;
    },
    staleTime: 0,
    refetchInterval: 15_000,
    gcTime: 0,
    // A 404 is definitive and a probe failure is not fatal — neither is worth
    // a second round trip.
    retry: false,
    refetchOnWindowFocus: true,
  }).data;
  return collections && report
    ? { ...collections, agentsOverview: report }
    : collections;
}
