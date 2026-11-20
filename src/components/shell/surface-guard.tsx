"use client";

import { useContext } from "react";
import { redirect, usePathname } from "next/navigation";
import {
  ErrorState,
  ListSkeleton,
  UnavailableSurface,
} from "@/components/console/bits";
import { PageHeader } from "./page-header";
import { SURFACES, useSurfaces, surfaceOfPath } from "@/lib/platform/surfaces";
import { PlatformError } from "@/lib/platform/http";
import { LANDING_ROUTE, PLAYGROUND_ROUTE, playgroundOnly } from "@/lib/routes";
import { ConsoleSessionContext } from "./console-session";

/**
 * Stops an absent or denied surface across its whole route tree, not just its
 * list page: a deployment that does not serve `/v1/skills` serves none of
 * `/skills/[id]` either, and a bookmark into the subtree would otherwise open
 * an editor over an endpoint that is not there (review finding, PR #60).
 *
 * The list pages keep their own check on their own query's error — it lands a
 * round trip before the shared probe does, so the page never flashes the
 * platform's error on the way to this.
 */
export function SurfaceGuard({ children }: { children: React.ReactNode }) {
  const surfaces = useSurfaces();
  const pathname = usePathname();
  const session = useContext(ConsoleSessionContext)?.data;
  const surface = surfaceOfPath(pathname);
  if (playgroundOnly(session)) {
    if (pathname === LANDING_ROUTE) redirect(PLAYGROUND_ROUTE);
    if (surface)
      return (
        <div>
          <PageHeader title={SURFACES[surface].label} />
          <ErrorState
            error={
              new PlatformError(403, {
                type: "error",
                error: {
                  type: "permission_error",
                  message: "This account can only use Playground.",
                },
              })
            }
          />
        </div>
      );
  }
  if (!surface) return <>{children}</>;
  const state = surfaces?.[surface];
  if (state && state.status === "unimplemented")
    return <UnavailableSurface surface={surface} />;
  if (state && state.status === "denied")
    return (
      <div>
        <PageHeader title={SURFACES[surface].label} />
        <ErrorState error={state.error} />
      </div>
    );
  const entry = SURFACES[surface];
  if ("api" in entry && entry.api === "native" && state?.status !== "available")
    return (
      <div>
        <PageHeader title={entry.label} />
        {state ? (
          <ErrorState
            error={new Error("Unable to confirm access to this surface.")}
          />
        ) : (
          <ListSkeleton />
        )}
      </div>
    );
  return <>{children}</>;
}
