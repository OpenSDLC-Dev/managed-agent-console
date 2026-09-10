"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResourceActions } from "@/components/console/resource-actions";
import { useArchiveDream, useCancelDream } from "@/lib/platform/queries";
import type { Dream } from "@/lib/platform/types";

export function DreamActions({ dream }: { dream: Dream }) {
  const cancel = useCancelDream(dream.id);
  const archive = useArchiveDream(dream.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const active = dream.status === "pending" || dream.status === "running";
  const terminal = !active;

  return (
    <span className="flex items-center gap-2">
      {active && (
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={cancel.isPending}
          onClick={() => setConfirmCancel(true)}
        >
          <Ban className="size-4" /> Cancel dream
        </Button>
      )}
      <ResourceActions
        resource="dream"
        archived={!!dream.archived_at}
        archiveWarning="There is no unarchive action."
        onArchive={
          terminal && !dream.archived_at ? () => archive.mutate() : undefined
        }
        archivePending={archive.isPending}
      />
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this dream?</DialogTitle>
            <DialogDescription>
              The platform will stop pending work and interrupt its running
              session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep running
            </Button>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate();
                setConfirmCancel(false);
              }}
            >
              Cancel dream
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
