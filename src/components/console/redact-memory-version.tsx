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
import { useRedactMemoryVersion } from "@/lib/platform/queries";

export function RedactMemoryVersion({
  storeId,
  versionId,
}: {
  storeId: string;
  versionId: string;
}) {
  const [open, setOpen] = useState(false);
  const redact = useRedactMemoryVersion(storeId, versionId);
  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        Redact
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redact this memory version?</DialogTitle>
            <DialogDescription>
              Redaction permanently removes its path, content, size, and digest.
              A live memory&apos;s current head cannot be redacted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={redact.isPending}
              onClick={() =>
                redact.mutate(undefined, { onSuccess: () => setOpen(false) })
              }
            >
              Redact version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
