"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { PageHeader } from "@/components/shell/page-header";
import { DataTable } from "./data-table";
import { ErrorState, ResourceStatus } from "./bits";
import {
  ORGANIZATION,
  ServiceAccount,
  ServiceAccountPage,
  nativeGet,
  nativeWrite,
} from "@/lib/platform/native";

export function ServiceAccounts() {
  const client = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<string>();
  const [archived, setArchived] = useState(false);
  const [editor, setEditor] = useState<ServiceAccount | "new">();
  const [archive, setArchive] = useState<ServiceAccount>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ["service-accounts", page, archived],
    queryFn: () =>
      nativeGet<ServiceAccountPage>(`${ORGANIZATION}/service_accounts`, {
        limit: 20,
        page,
        include_archived: archived,
      }),
  });
  const current = editor && editor !== "new" ? editor : undefined;

  async function change(path: string, body?: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      await nativeWrite(path, body);
      setEditor(undefined);
      setArchive(undefined);
      await client.invalidateQueries({ queryKey: ["service-accounts"] });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The service account could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const description = String(fields.get("description") ?? "");
    // The backend counts Unicode characters, not JavaScript UTF-16 units.
    if ([...description].length > 2000) {
      setError("Description must contain at most 2000 characters.");
      return;
    }
    const organization_role = String(fields.get("organization_role"));
    void change(
      current
        ? `${ORGANIZATION}/service_accounts/${encodeURIComponent(current.id)}`
        : `${ORGANIZATION}/service_accounts`,
      current
        ? { description: description || null, organization_role }
        : { name: String(fields.get("name")), description, organization_role },
    );
  }
  return (
    <div>
      <PageHeader
        title="Service accounts"
        subtitle="Non-human accounts for this organization."
        actions={
          <Button
            ref={triggerRef}
            onClick={() => {
              setError(undefined);
              setEditor("new");
            }}
          >
            Create service account
          </Button>
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Creating a service account does not create an API key.
      </p>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => {
            setPage(undefined);
            setArchived(e.target.checked);
          }}
        />
        Include archived
      </label>
      {error && !editor && !archive && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {list.error ? (
        <ErrorState error={list.error} />
      ) : (
        <DataTable
          rows={list.data?.data ?? []}
          rowKey={(a) => a.id}
          loading={list.isPending}
          empty={
            <p className="py-8 text-sm text-muted-foreground">
              No service accounts. Create one for non-human access.
            </p>
          }
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (a) => (
                <div>
                  <div>{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.description}
                  </div>
                </div>
              ),
            },
            {
              key: "role",
              header: "Organization role",
              cell: (a) => a.organization_role,
            },
            {
              key: "status",
              header: "Status",
              cell: (a) => <ResourceStatus archivedAt={a.archived_at} />,
            },
            {
              key: "actions",
              header: <span className="sr-only">Actions</span>,
              cell: (a) => (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={!!a.archived_at || busy}
                    aria-label={`Edit ${a.name}`}
                    onClick={() => {
                      setError(undefined);
                      setEditor(a);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!!a.archived_at || busy}
                    aria-label={`Archive ${a.name}`}
                    onClick={() => {
                      setError(undefined);
                      setArchive(a);
                    }}
                  >
                    Archive
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          disabled={!page}
          onClick={() => setPage(undefined)}
        >
          First page
        </Button>
        <Button
          variant="outline"
          disabled={!list.data?.next_page}
          onClick={() => setPage(list.data?.next_page ?? undefined)}
        >
          Next page
        </Button>
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(undefined);
            setError(undefined);
          }
        }}
      >
        <DialogContent finalFocus={triggerRef}>
          <DialogHeader>
            <DialogTitle>
              {current ? "Edit service account" : "Create service account"}
            </DialogTitle>
            <DialogDescription>
              Names are immutable. Archive an account to end its access.
            </DialogDescription>
          </DialogHeader>
          <form
            key={current?.id ?? "new"}
            method="post"
            onSubmit={save}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="sa-name">Name</Label>
              <Input
                id="sa-name"
                name="name"
                required
                pattern={"[a-z0-9\\-]{1,255}"}
                defaultValue={current?.name}
                disabled={!!current}
              />
              <p className="text-xs text-muted-foreground">
                1–255 lowercase letters, digits or hyphens.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-description">Description</Label>
              <Input
                id="sa-description"
                name="description"
                defaultValue={current?.description ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-role">Organization role</Label>
              <select
                id="sa-role"
                name="organization_role"
                defaultValue={current?.organization_role ?? "developer"}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              >
                <option>developer</option>
                <option>admin</option>
              </select>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditor(undefined)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {current ? "Save account" : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!archive}
        onOpenChange={(open) => {
          if (!open) {
            setArchive(undefined);
            setError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive service account?</DialogTitle>
            <DialogDescription>
              This ends the account&apos;s access. The archive cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchive(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                archive &&
                void change(
                  `${ORGANIZATION}/service_accounts/${encodeURIComponent(archive.id)}/archive`,
                )
              }
            >
              Confirm archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
