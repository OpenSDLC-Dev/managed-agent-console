"use client";

import { useQuery } from "@tanstack/react-query";
import { PlatformError, platformGet } from "./http";

/**
 * Feature detection for surfaces a deployment does not serve (CLAUDE.md
 * principle 3).
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
export const SURFACES = {
  agents: "v1/agents",
  sessions: "v1/sessions",
  environments: "v1/environments",
  vaults: "v1/vaults",
  skills: "v1/skills",
  files: "v1/files",
} as const;

export type Surface = keyof typeof SURFACES;

const SURFACE_NAMES = Object.keys(SURFACES) as Surface[];

/**
 * Whether `error` — raised by a query on one of the {@link SURFACES}
 * collection routes — means this deployment does not implement that surface.
 * Passing an item route's error here would misread a dead resource as a
 * missing endpoint.
 */
export function isUnimplemented(error: unknown): boolean {
  return error instanceof PlatformError && error.status === 404;
}

/**
 * Availability of every surface, probed once per session in parallel.
 *
 * Only a confirmed 404 marks a surface unavailable: a network failure or a
 * 5xx leaves it available, so a struggling platform degrades to "shown and
 * erroring" rather than to "silently missing". Undefined until the probe
 * answers, and callers show everything while unknown — a deployment that
 * serves all six never flickers.
 */
export function useSurfaces(): Record<Surface, boolean> | undefined {
  return useQuery({
    queryKey: ["surfaces"],
    queryFn: async () => {
      const probes = SURFACE_NAMES.map(async (surface) => {
        try {
          await platformGet<unknown>(SURFACES[surface], { limit: 1 });
          return [surface, true] as const;
        } catch (error) {
          return [surface, !isUnimplemented(error)] as const;
        }
      });
      return Object.fromEntries(await Promise.all(probes)) as Record<
        Surface,
        boolean
      >;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    // A 404 is definitive and a probe failure is not fatal — neither is worth
    // a second round trip.
    retry: false,
    refetchOnWindowFocus: false,
  }).data;
}
