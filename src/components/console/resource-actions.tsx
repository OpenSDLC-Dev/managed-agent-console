"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The reference's row/detail ⋯ menu: Archive and/or Delete, each confirming
 * through the same dialog the old header buttons used.
 */
export function ResourceActions({
  resource,
  archived,
  archiveWarning,
  deleteDescription,
  onArchive,
  onDelete,
  archivePending,
  deletePending,
}: {
  resource: string;
  archived?: boolean;
  archiveWarning?: string;
  deleteDescription?: string;
  onArchive?: () => void;
  onDelete?: () => void;
  archivePending?: boolean;
  deletePending?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const canArchive = !!onArchive && !archived;
  const canDelete = !!onDelete;
  if (!canArchive && !canDelete) return null;

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <div
      className="relative"
      data-testid="resource-actions"
      onClick={stop}
      onKeyDown={stop}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-36 rounded-lg border bg-popover p-1 shadow-md"
        >
          {canArchive && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                setMenuOpen(false);
                setConfirm("archive");
              }}
            >
              Archive
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive-surface/10"
              onClick={() => {
                setMenuOpen(false);
                setConfirm("delete");
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "delete" ? "Delete" : "Archive"} this {resource}?
            </DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? (deleteDescription ??
                  `Deleting is permanent and cannot be undone.`)
                : `Archiving is terminal on the platform — the ${resource} becomes read-only and cannot be unarchived.${archiveWarning ? ` ${archiveWarning}` : ""}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm === "delete" ? deletePending : archivePending}
              onClick={() => {
                if (confirm === "delete") onDelete?.();
                else onArchive?.();
                setConfirm(null);
              }}
            >
              {confirm === "delete" ? "Delete" : "Archive"} {resource}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
