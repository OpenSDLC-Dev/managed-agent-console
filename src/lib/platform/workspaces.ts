"use client";
import { useQuery } from "@tanstack/react-query";
import { assertOk } from "./http";
import {
  nativeGet,
  ORGANIZATION,
  type NativeSession,
  type WorkspaceRole,
} from "./native";
import { canonicalWorkspacePath, pathWorkspace } from "./tenancy";

export const workspaceAPI = ORGANIZATION + "/workspaces";
export const workspaceSettings = "/settings/workspaces";
export type WorkspaceEntry = {
  id: string;
  public_id: string;
  name: string;
  display_color: string;
  role: WorkspaceRole;
};
export type WorkspaceRecord = {
  id: string;
  name: string;
  display_color: string;
  archived_at: string | null;
};
export type WorkspaceMember = {
  id: string;
  type: "user" | "service_account";
  name: string;
  role: WorkspaceRole;
  inherited: boolean;
};
export const roleLabels: Record<WorkspaceRole, string> = {
  user: "User",
  limited_developer: "Limited Developer",
  developer: "Developer",
  admin: "Admin",
  billing: "Billing",
};

export function useWorkspaceIndex(enabled = true) {
  return useQuery({
    queryKey: ["workspace-index"],
    enabled,
    queryFn: async ({ signal }): Promise<WorkspaceEntry[]> => {
      const res = await fetch("/api/auth/workspaces", {
        cache: "no-store",
        signal,
      });
      await assertOk(res);
      const body: { data: WorkspaceEntry[] } = await res.json();
      return body.data;
    },
  });
}
export function useWorkspaceDirectory(
  archived: boolean,
  session?: Partial<NativeSession> | null,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      "workspace-settings",
      archived,
      session?.id,
      session?.role,
      session?.workspace_id,
      session?.workspace_role,
    ],
    queryFn: ({ signal }) =>
      nativeGet<WorkspaceRecord[]>(
        workspaceAPI,
        { include_archived: archived },
        signal,
      ),
    enabled,
    retry: false,
  });
}

export function useWorkspaceSettingsAccess(
  session?: Partial<NativeSession> | null,
) {
  const signedIn = !!(session?.signed_in && session.id);
  const isAdmin =
    session?.role === "admin" || session?.workspace_role === "admin";
  const index = useWorkspaceIndex(signedIn && !isAdmin);
  const canManage =
    signedIn &&
    (isAdmin || index.data?.some((w) => w.role === "admin") === true);
  const directory = useWorkspaceDirectory(false, session, canManage);
  return canManage && directory.isSuccess;
}

export function workspaceSettingsHref(space: string) {
  return (
    workspaceSettings +
    "/" +
    encodeURIComponent(space) +
    "?" +
    new URLSearchParams({ workspace: space })
  );
}
// The destination keeps the collection. Resource IDs, list cursors and drafts belong to the previous workspace.
export function switchDestination(path: string, entry: WorkspaceEntry) {
  if (entry.role === "user") return "/workspaces/" + entry.id + "/playground";
  if (entry.role === "billing")
    return "/usage?" + new URLSearchParams({ workspace: entry.id });
  if (path.startsWith("/settings/") && entry.role !== "admin")
    return "/workspaces/" + entry.id + "/agents";
  if (path.startsWith(workspaceSettings + "/"))
    return workspaceSettingsHref(entry.id);
  if (pathWorkspace(path)) {
    const collection = canonicalWorkspacePath(path).split("/")[3];
    return "/workspaces/" + entry.id + "/" + (collection || "agents-overview");
  }
  return (
    (path.startsWith("/settings/") ? workspaceSettings : "/dashboard") +
    "?" +
    new URLSearchParams({ workspace: entry.id })
  );
}
