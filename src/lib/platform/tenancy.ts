export const CONSOLE_ORG = "default";
export const CONSOLE_WORKSPACE = "default";

export function validWorkspace(value: string) {
  return value === CONSOLE_WORKSPACE || /^wrkspc_[a-zA-Z0-9]{26}$/.test(value);
}

export function pathWorkspace(path: string): string | undefined {
  return /^\/workspaces\/([^/?#]+)(?:\/|$)/.exec(path)?.[1];
}

/** The selection belongs to this tab's URL. Settings links can carry it in the query. */
export function selectedWorkspace(): string | undefined {
  if (typeof window === "undefined") return;
  const selected =
    pathWorkspace(window.location.pathname) ??
    new URLSearchParams(window.location.search).get("workspace");
  return selected && validWorkspace(selected) ? selected : undefined;
}

export function tabWorkspace(): string {
  return selectedWorkspace() ?? CONSOLE_WORKSPACE;
}

export function workspaceHref(href: string, space: string) {
  if (href.startsWith("/workspaces/default/")) {
    return (
      "/workspaces/" +
      encodeURIComponent(space) +
      href.slice("/workspaces/default".length)
    );
  }
  if (
    space !== CONSOLE_WORKSPACE &&
    /^\/(?:settings|dashboard|usage|models|providers)(?:$|[/?#])/.test(href)
  ) {
    const url = new URL(href, "https://console.invalid");
    url.searchParams.set("workspace", space);
    return url.pathname + url.search + url.hash;
  }
  return href;
}

export function canonicalWorkspacePath(path: string | null) {
  return (path ?? "").replace(
    /^\/workspaces\/[^/]+(?=\/)/,
    "/workspaces/default",
  );
}

export function workspaceHeaders(): Record<string, string> {
  const space = selectedWorkspace();
  return space ? { "x-workspace-id": space } : {};
}

export function selectedOptions() {
  return selectedWorkspace() ? { headers: workspaceHeaders() } : {};
}

export function workspaceGet(url: string, signal?: AbortSignal) {
  const options = selectedOptions();
  return signal || options.headers
    ? fetch(url, { ...options, ...(signal && { signal }) })
    : fetch(url);
}
