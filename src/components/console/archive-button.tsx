"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Confirm-then-archive control shared by resource detail pages. */
export function ArchiveButton({
  resource,
  warning,
  onConfirm,
  pending,
}: {
  resource: string;
  warning?: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <Archive className="size-4" /> Archive
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this {resource}?</DialogTitle>
            <DialogDescription>
              Archiving is terminal on the platform — the {resource} becomes
              read-only and cannot be unarchived.
              {warning ? ` ${warning}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              Archive {resource}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
