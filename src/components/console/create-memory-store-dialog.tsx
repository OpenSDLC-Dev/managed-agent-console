"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemoryStoreEditor, newMemoryStoreForm } from "./memory-store-editor";

export function CreateMemoryStoreButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className="h-8" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create memory store
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-[22px] leading-7">
              Create memory store
            </DialogTitle>
            <DialogDescription className="sr-only">
              Create persistent memory for your agents.
            </DialogDescription>
          </DialogHeader>
          <MemoryStoreEditor
            mode="create"
            initial={newMemoryStoreForm()}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
