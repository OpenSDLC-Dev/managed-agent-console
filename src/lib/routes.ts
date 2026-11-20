/** Shared landing page for the root route and navigation. */
export const LANDING_ROUTE = "/dashboard";
export const PLAYGROUND_ROUTE = "/playground";

export function playgroundOnly(
  session?: {
    role?: string;
    playground_access?: boolean;
  } | null,
) {
  return (
    session?.role === "user" && typeof session.playground_access === "boolean"
  );
}
