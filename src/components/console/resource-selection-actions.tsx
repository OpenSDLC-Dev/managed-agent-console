"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "./bits";
import type { Environment, Session } from "@/lib/platform/types";
import { useBatchResourceActions } from "@/lib/platform/queries";

export function ResourceSelectionActions({
  resource,
  selected,
  clear,
  onComplete,
}: {
  resource: "session" | "environment";
  selected: (Session | Environment)[];
  clear: () => void;
  onComplete: (ids: string[], action: "archive" | "delete") => void;
}) {
  const batch = useBatchResourceActions(resource);
  const plural = resource + "s";
  const [confirm, setConfirm] = useState<{
    action: "archive" | "delete";
    ids: string[];
  } | null>(null);
  const [failed, setFailed] = useState<
    NonNullable<typeof batch.data>["failed"]
  >([]);
  const visibleFailures = failed.filter(({ id }) =>
    selected.some((item) => item.id === id),
  );
  if (visibleFailures.length !== failed.length) setFailed(visibleFailures);
  if (
    !selected.length &&
    !visibleFailures.length &&
    !confirm &&
    !batch.isPending
  )
    return null;
  const running = selected.some(
    (item) => item.type === "session" && item.status === "running",
  );
  const actionLabel = confirm?.action === "delete" ? "Delete" : "Archive";
  return (
    <div className="space-y-3 pb-4">
      {batch.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Processing {plural}…
        </p>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{selected.length} selected</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={batch.isPending}
            onClick={() => {
              clear();
              batch.reset();
              setFailed([]);
            }}
          >
            Clear selection
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              batch.isPending ||
              selected.every((item) => !!item.archived_at) ||
              running
            }
            onClick={() =>
              setConfirm({
                action: "archive",
                ids: selected
                  .filter((item) => !item.archived_at)
                  .map((item) => item.id),
              })
            }
          >
            Archive
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={batch.isPending || running}
            onClick={() =>
              setConfirm({
                action: "delete",
                ids: selected.map((item) => item.id),
              })
            }
          >
            Delete
          </Button>
        </div>
      )}
      {visibleFailures.map(({ id, error }) => (
        <div key={id}>
          <p className="break-all text-sm">{id}</p>
          <ErrorState error={error} />
        </div>
      ))}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionLabel} {confirm?.ids.length}{" "}
              {confirm?.ids.length === 1 && resource === "session"
                ? resource
                : plural}
              ?
            </DialogTitle>
            <DialogDescription>
              {resource === "session"
                ? confirm?.action === "delete"
                  ? "Permanently delete the selected sessions, their event histories and session files."
                  : "Archived sessions retain their history and stop accepting new work."
                : confirm?.action === "delete"
                  ? "Deletion is permanent. Environments still referenced by sessions cannot be deleted."
                  : "Archiving is terminal. New sessions cannot use these environments. Already archived environments are skipped."}{" "}
              Failed {plural} remain selected for retry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={batch.isPending}
              onClick={() => {
                if (!confirm) return;
                const request = confirm;
                setConfirm(null);
                batch.mutate(request, {
                  onSuccess: (result) => {
                    setFailed(result.failed);
                    onComplete(result.succeeded, request.action);
                  },
                });
              }}
            >
              {actionLabel} {plural}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
