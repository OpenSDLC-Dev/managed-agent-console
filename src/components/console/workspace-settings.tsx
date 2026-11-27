"use client";

import { useContext, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shell/page-header";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { ErrorState } from "./bits";
import {
  nativeGet,
  nativeWrite,
  type WorkspaceRole,
} from "@/lib/platform/native";
import {
  roleLabels,
  useWorkspaceIndex,
  workspaceAPI,
  workspaceSettings,
  workspaceSettingsHref,
  type WorkspaceMember,
  type WorkspaceRecord,
} from "@/lib/platform/workspaces";

export function WorkspaceSettings() {
  const account = useContext(ConsoleSessionContext)?.data;
  const index = useWorkspaceIndex();
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ["workspace-settings", archived],
    queryFn: ({ signal }) =>
      nativeGet<WorkspaceRecord[]>(
        workspaceAPI,
        { include_archived: archived },
        signal,
      ),
  });
  const create = useMutation({
    mutationFn: () => nativeWrite<WorkspaceRecord>(workspaceAPI, { name }),
    onSuccess: async () => {
      setOpen(false);
      setName("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["workspace-settings"] }),
        cache.invalidateQueries({ queryKey: ["workspace-index"] }),
      ]);
    },
  });
  const def = index.data?.find((w) => w.id === "default" && w.role === "admin");
  const rows = [
    ...(def
      ? [
          {
            id: "default",
            name: def.name,
            display_color: def.display_color,
            archived_at: null,
          },
        ]
      : []),
    ...(list.data ?? []),
  ].filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader
        title="Workspaces"
        actions={
          account?.role === "admin" && (
            <Button
              onClick={() => {
                create.reset();
                setOpen(true);
              }}
            >
              Create workspace
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input
          aria-label="Search workspaces"
          placeholder="Search workspaces"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {account?.role === "admin" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Show archived
          </label>
        )}
      </div>
      {list.isError ? (
        <ErrorState error={list.error} />
      ) : index.isError ? (
        <ErrorState error={index.error} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Workspace ID</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((w) => (
              <TableRow
                key={w.id}
                data-workspace={w.id}
                data-archived={!!w.archived_at}
              >
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 rounded-sm"
                      style={{ backgroundColor: w.display_color }}
                    />
                    {w.archived_at ? (
                      w.name
                    ) : (
                      <Link
                        className="font-medium hover:underline"
                        href={workspaceSettingsHref(w.id)}
                      >
                        {w.name}
                      </Link>
                    )}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {w.id === "default" ? def?.public_id : w.id}
                </TableCell>
                <TableCell>{w.archived_at ? "Archived" : "Active"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  {list.isPending
                    ? "Loading workspaces…"
                    : "No workspaces found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Choose a name for the workspace.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <Label htmlFor="new-workspace-name">Name</Label>
            <Input
              autoFocus
              id="new-workspace-name"
              required
              maxLength={128}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {create.isError && <ErrorState error={create.error} />}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                Create workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WorkspaceDetails({ id }: { id: string }) {
  const cache = useQueryClient();
  const router = useRouter();
  const account = useContext(ConsoleSessionContext)?.data;
  const base = workspaceAPI + "/" + id;
  const isDefault = id === "default";
  const detail = useQuery({
    queryKey: ["workspace-details", id],
    enabled: !isDefault,
    queryFn: ({ signal }) =>
      nativeGet<WorkspaceRecord>(base, undefined, signal),
  });
  const members = useQuery({
    queryKey: ["workspace-members", id],
    queryFn: ({ signal }) =>
      nativeGet<WorkspaceMember[]>(base + "/members", undefined, signal),
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6c5bb9");
  const [archive, setArchive] = useState(false);
  const [alias, setAlias] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("user");
  const update = useMutation({
    mutationFn: () => nativeWrite(base, { name, display_color: color }),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["workspace-details"] }),
        cache.invalidateQueries({ queryKey: ["workspace-index"] }),
        cache.invalidateQueries({ queryKey: ["workspace-settings"] }),
      ]);
    },
  });
  const retire = useMutation({
    mutationFn: () => nativeWrite(base + "/archive", {}),
    onSuccess: () => {
      router.replace(workspaceSettings);
    },
  });
  const change = useMutation({
    mutationFn: (v: { principal: string; role?: WorkspaceRole }) =>
      v.role
        ? nativeWrite(base + "/members", {
            principal_id: v.principal,
            role: v.role,
          })
        : nativeWrite(
            base + "/members/" + encodeURIComponent(v.principal),
            undefined,
            "DELETE",
          ),
    onSuccess: async () => {
      setAlias("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["workspace-members", id] }),
        cache.invalidateQueries({ queryKey: ["workspace-index"] }),
      ]);
    },
  });
  const title = isDefault ? "Default" : (detail.data?.name ?? "Workspace");
  return (
    <>
      <Link
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
        href={workspaceSettings}
      >
        Workspaces
      </Link>
      <PageHeader
        title={title}
        actions={
          !isDefault &&
          detail.data && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setName(title);
                  setColor(detail.data.display_color);
                  setEditing(true);
                }}
              >
                Edit workspace
              </Button>
              {account?.role === "admin" && (
                <Button variant="outline" onClick={() => setArchive(true)}>
                  Archive workspace
                </Button>
              )}
            </div>
          )
        }
      />
      {detail.isError && <ErrorState error={detail.error} />}
      {members.isError ? (
        <ErrorState error={members.error} />
      ) : (
        <>
          <h2 className="mb-3 text-lg font-medium">Members</h2>
          <form
            className="mb-5 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (alias.trim())
                change.mutate({ principal: alias.trim(), role });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="grant-principal">
                Member or service account ID
              </Label>
              <Input
                id="grant-principal"
                required
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="user_… or svac_…"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="grant-role">Workspace role</Label>
              <select
                id="grant-role"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as WorkspaceRole)}
              >
                {(
                  ["user", "limited_developer", "developer", "admin"] as const
                ).map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={change.isPending || !alias.trim()}>
              Save grant
            </Button>
          </form>
          {change.isError && <ErrorState error={change.error} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Workspace role</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members.data ?? []).map((m) => (
                <TableRow key={m.id} data-principal={m.id} data-role={m.role}>
                  <TableCell>
                    {m.name}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {m.id}
                    </span>
                  </TableCell>
                  <TableCell>{roleLabels[m.role]}</TableCell>
                  <TableCell>
                    {m.inherited ? "Organization" : "Workspace"}
                  </TableCell>
                  <TableCell>
                    {!m.inherited && (
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={"Remove grant for " + m.name}
                        disabled={change.isPending}
                        onClick={() => change.mutate({ principal: m.id })}
                      >
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit workspace</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
          >
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={name}
              required
              maxLength={128}
              onChange={(e) => setName(e.target.value)}
            />
            <Label htmlFor="workspace-color">Display color</Label>
            <Input
              id="workspace-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            {update.isError && <ErrorState error={update.error} />}
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || update.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={archive} onOpenChange={setArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {title}?</DialogTitle>
            <DialogDescription>
              Archiving permanently stops this workspace’s deployments and
              retires its credentials. Historical usage stays in organization
              reports.
            </DialogDescription>
          </DialogHeader>
          {retire.isError && <ErrorState error={retire.error} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchive(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={retire.isPending}
              onClick={() => retire.mutate()}
            >
              Archive workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
