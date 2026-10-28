"use client";

import { usePathname } from "next/navigation";
import { ErrorState, UnavailableSurface } from "@/components/console/bits";
import { PageHeader } from "./page-header";
import { SURFACES, useSurfaces, surfaceOfPath } from "@/lib/platform/surfaces";

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
  const surface = surfaceOfPath(usePathname());
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
  return <>{children}</>;
}
