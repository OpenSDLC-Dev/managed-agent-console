"use client";

import { usePathname } from "next/navigation";
import { UnavailableSurface } from "@/components/console/bits";
import { useSurfaces, surfaceOfPath } from "@/lib/platform/surfaces";

/**
 * Stands the whole route tree of an unimplemented surface down, not just its
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
  if (surface && surfaces?.[surface] === false)
    return <UnavailableSurface surface={surface} />;
  return <>{children}</>;
}
