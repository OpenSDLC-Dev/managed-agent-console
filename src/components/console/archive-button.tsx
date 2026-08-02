"use client";

import { useState } from "react";
import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Confirm-then-act control for destructive resource actions. */
export function ConfirmButton({
  action,
  resource,
  description,
  icon,
  onConfirm,
  pending,
  triggerClassName,
}: {
  action: string;
  resource: string;
  description: string;
  icon: React.ReactNode;
  onConfirm: () => void;
  pending?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`h-8 ${triggerClassName ?? ""}`}
        onClick={() => setOpen(true)}
      >
        {icon} {action}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action} this {resource}?
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
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
              {action} {resource}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
  return (
    <ConfirmButton
      action="Archive"
      resource={resource}
      description={`Archiving is terminal on the platform — the ${resource} becomes read-only and cannot be unarchived.${warning ? ` ${warning}` : ""}`}
      icon={<Archive className="size-4" />}
      onConfirm={onConfirm}
      pending={pending}
    />
  );
}

export function DeleteButton({
  resource,
  description,
  onConfirm,
  pending,
}: {
  resource: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <ConfirmButton
      action="Delete"
      resource={resource}
      description={description}
      icon={<Trash2 className="size-4" />}
      onConfirm={onConfirm}
      pending={pending}
      triggerClassName="text-destructive"
    />
  );
}

/** Icon-only confirm-then-act control for table-row deletes. */
export function ConfirmIconButton({
  label,
  title,
  description,
  onConfirm,
  pending,
  children,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-muted-foreground"
        aria-label={label}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
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
              {title}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
