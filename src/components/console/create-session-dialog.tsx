"use client";

import { useState } from "react";
import type { Agent } from "@/lib/platform/types";
import { Plus, Play } from "lucide-react";
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
  initialAgent,
}: {
  variant?: "default" | "outline";
  initialAgent?: Agent;
}) {
  const [open, setOpen] = useState(false);
  const [sessionAgent, setSessionAgent] = useState(initialAgent);
  return (
    <>
      <Button
        variant={variant}
        className="h-8"
        onClick={() => {
          setSessionAgent(initialAgent);
          setOpen(true);
        }}
      >
        {initialAgent ? (
          <Play className="size-4" />
        ) : (
          variant === "default" && <Plus className="size-4" />
        )}{" "}
        {initialAgent ? "Start session" : "Create session"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create session</DialogTitle>
            <DialogDescription>
              Set up an instance of your agent in its environment.
            </DialogDescription>
          </DialogHeader>
          <SessionCreateForm
            initialAgent={sessionAgent}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
