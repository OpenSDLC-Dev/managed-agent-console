/** Shared landing page for the root route and navigation. */
export const LANDING_ROUTE = "/dashboard";
export const PLAYGROUND_ROUTE = "/playground";
export const MESSAGES_ROUTE = "/messages";
export const MESSAGE_LOGS_ROUTE = "/messages/logs";

export function isMessageReport(pathname: string) {
  return pathname === MESSAGES_ROUTE || pathname === MESSAGE_LOGS_ROUTE;
}

export function isDashboardPath(pathname: string) {
  return pathname === LANDING_ROUTE || pathname.startsWith(`${LANDING_ROUTE}/`);
}

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
