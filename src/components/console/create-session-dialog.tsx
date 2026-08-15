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
import { SessionCreateForm } from "@/components/console/session-create-form";

export function CreateSessionButton({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className="h-8" onClick={() => setOpen(true)}>
        {variant === "default" && <Plus className="size-4" />} Create session
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create session</DialogTitle>
            <DialogDescription>
              Set up an instance of your agent in its environment.
            </DialogDescription>
          </DialogHeader>
          <SessionCreateForm onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
