"use client";

import { useContext, useRef, useState, type RefObject } from "react";
import Link from "@/components/shell/workspace-navigation";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Ellipsis,
  KeyRound,
  Trash2,
  X,
} from "lucide-react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useUpdateApiKey } from "@/lib/platform/queries";
import type { ApiKeyListItem } from "@/lib/platform/types";
import {
  apiKeyAccountLabel,
  apiKeyCreatorLabel,
  apiKeyDisplayName,
  apiKeyStatusLabel,
} from "./api-key-labels";
import { Time } from "./bits";
import { IdCell } from "./copy-id";
import { Field } from "./detail";
import { ModelAccessCell } from "./model-access";

type KeyActionsProps = {
  apiKey: ApiKeyListItem;
  canViewCost: boolean;
  update: ReturnType<typeof useUpdateApiKey>;
};

export function ApiKeyActions({
  apiKey,
  canViewCost,
  update,
}: KeyActionsProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete =
    !!apiKey.can_manage && !!apiKey.created_by && apiKey.status !== "archived";
  const canToggle =
    canDelete && (apiKey.status === "active" || apiKey.status === "inactive");
  // Keep the trigger focusable while a write is pending. The confirmation
  // returns focus here before the refreshed list may remove its row.
  const menuUnavailable = update.isPending && !canViewCost;
  const active = apiKey.status === "active";
  const name = apiKeyDisplayName(apiKey);
  if (confirmDelete && !canDelete) setConfirmDelete(false);
  if (!canViewCost && !canDelete) return null;

  return (
    <div
      data-testid="resource-actions"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
    >
      <DropdownMenu
        onOpenChange={(open, details) => {
          if (open && menuUnavailable) details.cancel();
        }}
      >
        <DropdownMenuTrigger
          ref={trigger}
          aria-disabled={menuUnavailable || undefined}
          aria-label={`More actions for ${name}`}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 text-muted-foreground aria-disabled:opacity-50"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-40"
          finalFocus={confirmDelete ? false : trigger}
        >
          {canViewCost && (
            <DropdownMenuItem
              render={
                <Link
                  href={`/usage?api_key=${encodeURIComponent(apiKey.id)}&range=mtd`}
                  prefetch={false}
                />
              }
            >
              <DollarSign /> View cost
            </DropdownMenuItem>
          )}
          {canViewCost && canDelete && <DropdownMenuSeparator />}
          {canToggle && (
            <DropdownMenuItem
              data-testid={`toggle-${apiKey.id}`}
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  id: apiKey.id,
                  status: active ? "inactive" : "active",
                })
              }
            >
              {active ? <Ban /> : <CheckCircle2 />}
              {active ? "Disable API key" : "Enable API key"}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              disabled={update.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete API key
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canDelete && confirmDelete && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDelete(false);
          }}
        >
          <DialogContent initialFocus={cancel} finalFocus={trigger}>
            <DialogHeader>
              <DialogTitle>Delete API key</DialogTitle>
              <DialogDescription>
                Delete API key “{name}”? Anything using it stops working
                immediately. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                ref={cancel}
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={update.isPending}
                onClick={() => {
                  update.mutate({ id: apiKey.id, status: "archived" });
                  setConfirmDelete(false);
                }}
              >
                Delete API key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function ApiKeyDetails({
  apiKey,
  rows,
  onSelect,
  onClose,
  finalFocus,
  fallbackFocus,
  canViewCost,
  update,
}: Omit<KeyActionsProps, "apiKey"> & {
  apiKey: ApiKeyListItem | null | undefined;
  rows: ApiKeyListItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
  finalFocus?: RefObject<HTMLElement | null>;
  fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const session = useContext(ConsoleSessionContext)?.data;
  const closeButton = useRef<HTMLButtonElement>(null);
  if (!apiKey) return null;
  const index = rows.findIndex((key) => key.id === apiKey.id);
  const previous = rows[index - 1];
  const next = index >= 0 ? rows[index + 1] : undefined;

  return (
    <Dialog
      open
      modal={false}
      onOpenChange={(open, details) => {
        if (open) return;
        if (
          details.reason === "outside-press" ||
          details.reason === "focus-out"
        ) {
          const target =
            details.event instanceof FocusEvent
              ? details.event.relatedTarget
              : details.event.target;
          // The list owns row selection. Keep this panel mounted as a click
          // or a keyboard user moves to another key.
          if (
            target instanceof Element &&
            target.closest("tr")?.querySelector("button[data-key-id]")
          ) {
            details.cancel();
            return;
          }
        }
        onClose();
      }}
    >
      <DialogContent
        data-api-key-detail={apiKey.id}
        showCloseButton={false}
        showOverlay={false}
        initialFocus={closeButton}
        finalFocus={() =>
          finalFocus?.current?.isConnected
            ? finalFocus.current
            : (fallbackFocus?.current ?? false)
        }
        className="inset-y-2 right-2 left-auto flex h-auto w-[560px] max-w-[calc(100%-1rem)] translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto p-0 shadow-lg sm:max-w-[calc(100%-1rem)] data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <div className="flex shrink-0 items-center gap-2 px-4 py-2 text-muted-foreground">
          <IdCell key={apiKey.id} id={apiKey.id} />
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous"
              disabled={!previous}
              onClick={() => previous && onSelect(previous.id)}
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next"
              disabled={!next}
              onClick={() => next && onSelect(next.id)}
            >
              <ChevronDown />
            </Button>
            <Button
              ref={closeButton}
              variant="ghost"
              size="icon-sm"
              aria-label="Close details"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </div>
        <div className="px-4 pt-2 pb-6">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="flex min-w-0 items-start gap-2 text-[15px] leading-5">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="break-all">{apiKeyDisplayName(apiKey)}</span>
            </DialogTitle>
            <ApiKeyActions
              key={apiKey.id}
              apiKey={apiKey}
              canViewCost={canViewCost}
              update={update}
            />
          </div>
          <DialogDescription className="mt-1 break-all font-mono text-xs">
            {apiKey.partial_key_hint}
          </DialogDescription>
          <dl className="mt-6 grid grid-cols-[minmax(6rem,30%)_minmax(0,1fr)] gap-x-4 gap-y-4 text-sm">
            <Field label="Created">
              <Time iso={apiKey.created_at} />
            </Field>
            <Field label="Created by">
              {apiKeyCreatorLabel(apiKey, session)}
            </Field>
            <Field label="Linked account">
              {apiKeyAccountLabel(apiKey, session)}
            </Field>
            {apiKey.workspace_id && (
              <Field label="Workspace">{apiKey.workspace_id}</Field>
            )}
            <Field label="Expires">
              {apiKey.expires_at ? <Time iso={apiKey.expires_at} /> : "Never"}
            </Field>
            <Field label="Status">
              <span data-key-status={apiKey.status}>
                {apiKeyStatusLabel(apiKey.status)}
              </span>
            </Field>
            <Field label="Model access">
              <ModelAccessCell apiKey={apiKey} />
            </Field>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
