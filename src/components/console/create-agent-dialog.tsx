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
import { AgentCreateForm } from "@/components/console/agent-create-form";

export function CreateAgentButton({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className="h-8" onClick={() => setOpen(true)}>
        {variant === "default" && <Plus className="size-4" />} Create agent
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-[880px]">
          <DialogHeader>
            <DialogTitle className="text-[22px] leading-7">
              Create agent
            </DialogTitle>
            <DialogDescription>Start from a template.</DialogDescription>
          </DialogHeader>
          <AgentCreateForm onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
