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
import { DeploymentEditor, newDeploymentForm } from "./deployment-editor";

export function CreateDeploymentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className="h-8" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create deployment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-[880px]">
          <DialogHeader>
            <DialogTitle className="text-[22px] leading-7">
              Create deployment
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure the agent, environment and trigger for each run.
            </DialogDescription>
          </DialogHeader>
          <DeploymentEditor
            mode="create"
            initial={newDeploymentForm()}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
