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
import { cn } from "@/lib/utils";

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
        <DialogContent
          className={cn(
            "max-h-[90vh] overflow-y-auto sm:max-w-lg",
            initialAgent && "sm:max-w-[720px] sm:p-6",
          )}
        >
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
