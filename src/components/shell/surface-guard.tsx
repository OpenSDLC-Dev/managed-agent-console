"use client";

import { useContext, useRef, useState, type ReactNode } from "react";
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
import { PortalContainer } from "@/components/ui/portal-container";

function UnconfirmedNativeSurface({
  label,
  pending,
}: {
  label: string;
  pending: boolean;
}) {
  return (
    <div>
      <PageHeader title={label} />
      {pending ? (
        <ListSkeleton />
      ) : (
        <ErrorState
          error={new Error("Unable to confirm access to this surface.")}
        />
      )}
    </div>
  );
}

function ServiceAccountAdmission({
  available,
  children,
}: {
  available: boolean;
  children: ReactNode;
}) {
  const [admitted, setAdmitted] = useState(available);
  const container = useRef<HTMLDivElement>(null);
  if (available && !admitted) setAdmitted(true);
  // An inconclusive background probe hides the UI until access is confirmed.
  // Retain the mounted draft for that interval. A definitive refusal unmounts this boundary.
  return (
    <>
      {!available && (
        <div aria-live="polite">
          <UnconfirmedNativeSurface
            label={SURFACES["service-accounts"].label}
            pending={false}
          />
        </div>
      )}
      {(admitted || available) && (
        <div ref={container} hidden={!available} inert={!available}>
          <PortalContainer.Provider value={container}>
            {children}
          </PortalContainer.Provider>
        </div>
      )}
    </>
  );
}

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
  if (surface === "service-accounts" && state)
    return (
      <ServiceAccountAdmission
        key={JSON.stringify([pathname, session?.id, session?.role])}
        available={state.status === "available"}
      >
        {children}
      </ServiceAccountAdmission>
    );
  if ("api" in entry && entry.api === "native" && state?.status !== "available")
    return <UnconfirmedNativeSurface label={entry.label} pending={!state} />;
  return <>{children}</>;
}
