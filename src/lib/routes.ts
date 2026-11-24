/** Shared landing page for the root route and navigation. */
export const LANDING_ROUTE = "/dashboard";
export const PLAYGROUND_ROUTE = "/playground";
export const MESSAGES_ROUTE = "/messages";
export const MESSAGE_LOGS_ROUTE = "/messages/logs";
export const RESOURCES_ROUTE = "/resources";

export const AGENTS_OVERVIEW_ROUTE = "/agents/overview";
export const AGENTS_CREATE_ROUTE = "/agents/create";

export function isAgentsWorkspacePage(pathname: string) {
  return (
    pathname === AGENTS_OVERVIEW_ROUTE ||
    pathname === AGENTS_CREATE_ROUTE ||
    pathname.startsWith(AGENTS_CREATE_ROUTE + "/")
  );
}

export function isReportPage(pathname: string) {
  return (
    isAgentsWorkspacePage(pathname) ||
    [MESSAGES_ROUTE, MESSAGE_LOGS_ROUTE, RESOURCES_ROUTE].includes(pathname)
  );
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
