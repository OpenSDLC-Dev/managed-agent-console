/** Browser page addresses. Platform request paths are defined by its API clients. */
const workspace = "/workspaces/default";
export const surfacePaths = {
  agents: `${workspace}/agents`,
  sessions: `${workspace}/sessions`,
  deployments: `${workspace}/deployments`,
  environments: `${workspace}/environments`,
  "memory-stores": `${workspace}/memory-stores`,
  vaults: `${workspace}/vaults`,
  dreams: `${workspace}/dreams`,
  files: `${workspace}/files`,
  skills: `${workspace}/skills`,
  "api-keys": "/settings/keys",
  members: "/settings/members",
  "service-accounts": "/settings/service-accounts",
  models: "/models",
  providers: "/providers",
  usage: "/usage",
} as const;

export const LANDING_ROUTE = "/dashboard";
export const PLAYGROUND_ROUTE = `${workspace}/playground`;
export const MESSAGES_ROUTE = `${workspace}/messages-overview`;
export const MESSAGE_LOGS_ROUTE = `${workspace}/logs`;
export const RESOURCES_ROUTE = `${workspace}/resources-overview`;

export const AGENTS_OVERVIEW_ROUTE = `${workspace}/agents-overview`;
export const AGENTS_CREATE_ROUTE = `${workspace}/agent-quickstart`;

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
