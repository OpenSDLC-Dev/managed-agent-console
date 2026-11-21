"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useContext, useId, useRef, useState, type RefObject } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { useUnsavedChanges } from "@/components/shell/unsaved-changes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  nativeWrite,
  ORGANIZATION,
  type ServiceAccount,
} from "@/lib/platform/native";

type DialogProps = {
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
};

const roles = [
  { value: "developer", label: "Developer" },
  { value: "admin", label: "Admin" },
] as const;

export function useServiceAccountWrite<T>(
  write: (data: T, principalId?: string) => Promise<ServiceAccount>,
) {
  const client = useQueryClient();
  const principalId = useContext(ConsoleSessionContext)?.data?.id;
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationKey: ["service-accounts", "write"],
    mutationFn: (data: T) => write(data, principalId),
    meta: { errorToast: false },
    onSuccess: async (account) => {
      const affected = [
        "service-accounts",
        "key-owner-service-accounts",
        "deployment-initiator-service-accounts",
      ];
      if (account.archived_at) affected.push("api-keys");
      // An initial list request can predate this write. Invalidating it alone
      // reuses that old request and can hide the newly created account.
      await Promise.all(
        affected.map((key) => client.cancelQueries({ queryKey: [key] })),
      );
      client.setQueryData(["service-accounts", "detail", account.id], account);
      for (const key of affected) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  return {
    error: mutation.error,
    isPending: mutation.isPending,
    mutate: (...args: Parameters<typeof mutation.mutate>) => {
      // A second submit can arrive before React Query renders its pending state.
      if (submitting.current) return;
      submitting.current = true;
      mutation.mutate(...args);
    },
  };
}

type NewAccount = Pick<ServiceAccount, "name" | "organization_role"> & {
  description: string;
};

export function CreateServiceAccountDialog({
  onClose,
  onCreated,
  returnFocus,
}: DialogProps & { onCreated: (account: ServiceAccount) => void }) {
  const id = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] =
    useState<ServiceAccount["organization_role"]>("developer");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const create = useServiceAccountWrite((data: NewAccount, principalId) =>
    nativeWrite<ServiceAccount>(
      `${ORGANIZATION}/service_accounts`,
      data,
      "POST",
      false,
      principalId,
    ),
  );

  const dirty = name !== "" || description !== "" || role !== "developer";
  useUnsavedChanges(dirty);
  const nameProblem = /[^a-z0-9-]/.test(name)
    ? "Only lowercase letters, numbers, and hyphens allowed"
    : name.length > 255
      ? "Name must contain at most 255 characters."
      : undefined;
  // The platform counts Unicode code points, including a single astral character as one.
  const descriptionProblem =
    [...description].length > 2000
      ? "Description must contain at most 2000 characters."
      : undefined;
  const canSubmit =
    Boolean(name) && !nameProblem && !descriptionProblem && !create.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (create.isPending || dirty) {
          details.cancel();
          if (!create.isPending) setConfirmDiscard(true);
        } else {
          onClose();
        }
      }}
    >
      <DialogContent
        initialFocus={nameField}
        finalFocus={returnFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px] data-nested-dialog-open:brightness-50 data-nested-dialog-open:blur-[2px]"
      >
        <DialogHeader>
          <DialogTitle className="pr-7">Create service account</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            create.mutate(
              { name, description, organization_role: role },
              { onSuccess: onCreated },
            );
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              ref={nameField}
              name="name"
              type="text"
              required
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. research-jobs"
              className="h-7 font-mono"
              disabled={create.isPending}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(nameProblem)}
              aria-describedby={`${id}-name-hint${nameProblem ? ` ${id}-name-error` : ""}`}
            />
            <p
              id={`${id}-name-hint`}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              Lowercase alphanumeric and hyphens. Can’t be changed after
              creation.
            </p>
            {nameProblem && (
              <p
                id={`${id}-name-error`}
                role="alert"
                className="text-xs text-destructive"
              >
                {nameProblem}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-description`}>
              Description{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <textarea
              id={`${id}-description`}
              name="description"
              rows={3}
              placeholder="e.g. CI/CD pipeline workloads"
              className="min-h-[76px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive-surface dark:bg-input/30"
              disabled={create.isPending}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-invalid={Boolean(descriptionProblem)}
              aria-describedby={
                descriptionProblem ? `${id}-description-error` : undefined
              }
            />
            {descriptionProblem && (
              <p
                id={`${id}-description-error`}
                role="alert"
                className="text-xs text-destructive"
              >
                {descriptionProblem}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label id={`${id}-role-label`} htmlFor={`${id}-role`}>
              Organization role
            </Label>
            <Select
              name="organization_role"
              items={roles}
              value={role}
              disabled={create.isPending}
              onValueChange={(value) => {
                if (value !== null) setRole(value);
              }}
            >
              <SelectTrigger
                id={`${id}-role`}
                size="sm"
                className="w-full"
                aria-labelledby={`${id}-role-label`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {roles.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {create.error && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={!canSubmit}>
              Create service account
            </Button>
          </div>
        </form>
        <AlertDialog.Root
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
        >
          <DialogContent
            className="sm:max-w-[400px]"
            showCloseButton={false}
            initialFocus={keepEditing}
            finalFocus={nameField}
          >
            <DialogHeader>
              <DialogTitle>Discard unsaved changes?</DialogTitle>
              <DialogDescription>Your changes will be lost.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                ref={keepEditing}
                size="sm"
                variant="outline"
                onClick={() => setConfirmDiscard(false)}
              >
                Keep editing
              </Button>
              <Button size="sm" variant="destructive" onClick={onClose}>
                Discard
              </Button>
            </div>
          </DialogContent>
        </AlertDialog.Root>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveServiceAccountDialog({
  account,
  onClose,
  onArchived,
  returnFocus,
}: DialogProps & {
  account: ServiceAccount;
  onArchived: (account: ServiceAccount) => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  const archive = useServiceAccountWrite((id: string, principalId) =>
    nativeWrite<ServiceAccount>(
      `${ORGANIZATION}/service_accounts/${encodeURIComponent(id)}/archive`,
      undefined,
      "POST",
      false,
      principalId,
    ),
  );
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (archive.isPending) details.cancel();
        else onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[400px]"
        showCloseButton={false}
        initialFocus={confirm}
        finalFocus={returnFocus}
      >
        <DialogHeader>
          <DialogTitle>Archive service account</DialogTitle>
          <DialogDescription>
            <strong className="break-all">{account.name}</strong> will move to
            Archived. Its API keys will stop working immediately. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {archive.error && (
          <p role="alert" className="text-sm text-destructive">
            {archive.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={archive.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            ref={confirm}
            size="sm"
            variant="destructive"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(account.id, { onSuccess: onArchived })
            }
          >
            Archive
          </Button>
        </div>
      </DialogContent>
    </AlertDialog.Root>
  );
}
