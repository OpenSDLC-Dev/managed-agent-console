"use client";

import { useState } from "react";
import { Check, Copy, Plus, X } from "lucide-react";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  EmptyState,
  ErrorState,
  RequestId,
  Time,
} from "@/components/console/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmIconButton } from "@/components/console/archive-button";
import { Trash2 } from "lucide-react";
import { copyText } from "@/lib/copy-text";
import { cn } from "@/lib/utils";
import { PlatformError } from "@/lib/platform/http";
import { useCreateApiKey, useUpdateApiKey } from "@/lib/platform/queries";
import { CONSOLE_WORKSPACE } from "@/lib/platform/surfaces";
import type { ApiKey } from "@/lib/platform/types";

/**
 * How long a new key lives, offered as the reference offers it.
 *
 * Every one of these is client-side sugar: the wire takes an absolute instant
 * and has no duration vocabulary at all (`internal/api/consoleapikeys.go`), so
 * a label resolves to a timestamp here and the platform never learns which
 * button was pressed. `Never` is the absence of the field rather than a
 * sentinel — the recorded contract from both ends, and the platform accepts an
 * explicit null for the same meaning.
 */
const EXPIRY_OPTIONS = [
  { value: "3h", label: "3 hours", hours: 3 },
  { value: "1d", label: "1 day", hours: 24 },
  { value: "7d", label: "7 days", hours: 24 * 7 },
  { value: "30d", label: "30 days", hours: 24 * 30 },
  { value: "custom", label: "Custom", hours: null },
  { value: "never", label: "Never", hours: null },
] as const;

type ExpiryChoice = (typeof EXPIRY_OPTIONS)[number]["value"];

/**
 * The instant a choice resolves to, or `undefined` for a key that never
 * expires — which the caller must then send as an **absent** field.
 *
 * Exported for its own test: this is the one piece of arithmetic on the
 * surface, and a wrong multiplier mints a credential with the wrong lifetime,
 * which nothing on the page would look wrong about.
 */
export function expiryInstant(
  choice: ExpiryChoice,
  custom: string,
  now: number,
): string | undefined {
  if (choice === "never") return undefined;
  if (choice === "custom") {
    // `datetime-local` yields a local wall-clock string with no zone; Date
    // parses it as local time, which is what the operator meant by it.
    const parsed = Date.parse(custom);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
  }
  const option = EXPIRY_OPTIONS.find((o) => o.value === choice);
  if (!option?.hours) return undefined;
  return new Date(now + option.hours * 3_600_000).toISOString();
}

/** A custom choice with no valid instant is not yet a submittable form. */
function customIsIncomplete(choice: ExpiryChoice, custom: string): boolean {
  return choice === "custom" && Number.isNaN(Date.parse(custom));
}

const STATUS_STYLE: Record<string, string> = {
  active:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  inactive: "bg-secondary text-secondary-foreground border-transparent",
  expired:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  archived: "text-muted-foreground",
};

/**
 * The reveal-once dialog, the only place a management key's plaintext is ever
 * rendered — the same discipline plan 07 slice 3 wrote for environment keys,
 * and it matters more here: this credential is root on the platform. The value
 * is not written to a `data-*` attribute, not logged, not put in a toast, not
 * stored, and passed nowhere but this block and the clipboard.
 */
function RevealKeyDialog({
  secret,
  onClose,
}: {
  secret: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your API key</DialogTitle>
          <DialogDescription>
            Keep a record of the key below. You won&apos;t be able to view it
            again.
          </DialogDescription>
        </DialogHeader>
        <pre
          data-testid="revealed-api-key"
          className="rounded-md border bg-secondary/40 p-3 font-mono text-[12px] break-all"
        >
          {secret}
        </pre>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              void copyText(secret).then((ok) => {
                setCopied(ok ? "ok" : "fail");
                window.setTimeout(() => setCopied(null), 1500);
              });
            }}
          >
            {copied === "ok" ? (
              <Check className="size-4" />
            ) : copied === "fail" ? (
              <X className="size-4 text-destructive" />
            ) : (
              <Copy className="size-4" />
            )}
            Copy API key
          </Button>
          <Button data-testid="close-revealed-api-key" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Create, then reveal — one control, two dialogs, the reference's sequence. */
function CreateKeyButton() {
  const create = useCreateApiKey();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<ExpiryChoice>("30d");
  const [custom, setCustom] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  const discardSecret = () => {
    setSecret(null);
    create.reset();
  };

  /**
   * Puts the form back to its defaults, and the only way the dialog closes.
   *
   * Cancel used to set `open` directly, which does not run Radix's
   * `onOpenChange` — so the draft survived, and the next open of the dialog
   * came back pre-filled with whatever was abandoned. On a form whose fields
   * are a name and a lifetime that includes **Never**, a stale draft is a key
   * minted with an expiry nobody chose this time.
   */
  const resetDraft = () => {
    setName("");
    setChoice("30d");
    setCustom("");
    create.reset();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || customIsIncomplete(choice, custom)) return;
    const expiresAt = expiryInstant(choice, custom, Date.now());
    create.mutate(
      // Absent rather than null for "never": both mean the same to the
      // platform, and absent is what the reference sends.
      { name: trimmed, ...(expiresAt ? { expires_at: expiresAt } : {}) },
      {
        onSuccess: (issued) => {
          setSecret(issued.raw_key);
          setOpen(false);
          setName("");
          setChoice("30d");
          setCustom("");
        },
        // `create.reset()` is deliberately NOT called here: it would clear the
        // mutation before the reveal dialog has rendered from it.
      },
    );
  };

  const error = create.error;
  const incomplete = !name.trim() || customIsIncomplete(choice, custom);
  return (
    <>
      <Button
        size="sm"
        className="h-8"
        onClick={() => {
          resetDraft();
          setOpen(true);
        }}
      >
        <Plus className="size-4" /> Create key
      </Button>

      {/* Dismissal is refused while the POST is in flight, for the reason plan
          07 slice 3 recorded: the platform mints the key when the request
          lands, and a dismissal detaches the handler that captures the
          plaintext — leaving a live credential nobody has ever seen. */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && create.isPending) return;
          setOpen(next);
          if (!next) resetDraft();
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                An API key carries full management authority on this platform.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              {/* Read-only, as the reference has it: the segment is in every
                  URL this page calls and this platform answers for one value. */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-key-workspace">Workspace</Label>
                <Input
                  id="api-key-workspace"
                  value={CONSOLE_WORKSPACE}
                  readOnly
                  disabled
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  autoFocus
                  placeholder="my-secret-key"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-key-expires">Expires</Label>
                <select
                  id="api-key-expires"
                  data-testid="api-key-expires"
                  value={choice}
                  onChange={(event) =>
                    setChoice(event.target.value as ExpiryChoice)
                  }
                  className="h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {/* "Never" is the one choice that cannot be undone by waiting,
                    so it says so rather than merely being styled as danger —
                    the reference's red is doing the same job with less. */}
                {choice === "never" && (
                  <p
                    data-testid="never-expires-warning"
                    className="text-[13px] text-destructive"
                  >
                    This key will work until somebody archives it.
                  </p>
                )}
                {choice === "custom" && (
                  <Input
                    type="datetime-local"
                    aria-label="Custom expiry"
                    data-testid="api-key-custom-expiry"
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                  />
                )}
              </div>
              {error && (
                <p className="text-[13px] text-destructive" role="alert">
                  {error instanceof Error ? error.message : "Request failed"}
                  {error instanceof PlatformError && error.requestId && (
                    <>
                      {" "}
                      <RequestId id={error.requestId} />
                    </>
                  )}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={create.isPending}
                onClick={() => {
                  // Through the same door as every other close: setting `open`
                  // alone would skip `onOpenChange` and leave the draft behind.
                  setOpen(false);
                  resetDraft();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || incomplete}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {secret !== null && (
        <RevealKeyDialog secret={secret} onClose={discardSecret} />
      )}
    </>
  );
}

/**
 * The management-key surface.
 *
 * Three of the reference's columns do not ship, and their absence is a decision
 * rather than an omission (plan 07's own "three gaps"): `Last used` and `Cost`
 * have no source on this platform, and `Created by` renders the actor id the
 * wire carries instead of a display name over an email, because there is no
 * member lookup to enrich it with. Inventing any of the three would be the
 * console asserting something nobody told it.
 */
export function ApiKeysTable({
  keys,
  loading,
  error,
}: {
  keys: ApiKey[];
  loading: boolean;
  error: unknown;
}) {
  const update = useUpdateApiKey();

  const columns: Column<ApiKey>[] = [
    {
      key: "key",
      header: "Key",
      className: "w-full",
      // Two lines, as the reference renders it: the operator's label, then the
      // hint that identifies which credential a log line belongs to.
      cell: (k) => (
        <span className="flex flex-col" data-key-id={k.id}>
          <span>{k.name}</span>
          <span className="font-mono text-[12px] text-muted-foreground">
            {k.partial_key_hint}
          </span>
        </span>
      ),
    },
    {
      key: "created_by",
      header: "Created by",
      cell: (k) => (
        <span
          className="whitespace-nowrap text-[13px] text-muted-foreground"
          data-created-by={k.created_by?.id ?? ""}
          data-created-by-type={k.created_by?.type ?? ""}
        >
          {k.created_by ? k.created_by.id : "Control plane"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (k) => <Time iso={k.created_at} />,
    },
    {
      key: "expires",
      header: "Expires",
      cell: (k) => (
        <span data-expires-at={k.expires_at ?? ""}>
          {k.expires_at ? <Time iso={k.expires_at} /> : "Never"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (k) => (
        <Badge
          variant="outline"
          className={cn("font-normal", STATUS_STYLE[k.status])}
          data-key-status={k.status}
        >
          {k.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (k) => {
        // A key the control plane manages has no issuer, and the platform
        // refuses every mutation on it: its lifecycle is rotation-by-restart.
        // Showing controls that are guaranteed to 400 would be a worse lie than
        // showing none, and this is a mirror of the wire rather than a rule
        // stricter than it.
        if (!k.created_by) return null;
        // Archived is terminal on this surface, and an expired key admits
        // exactly one operation — archiving it. Both are the platform's rules,
        // stated in its refusals.
        if (k.status === "archived") return null;
        const expired = k.status === "expired";
        return (
          <span className="flex items-center justify-end gap-1">
            {!expired && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                data-testid={`toggle-${k.id}`}
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    id: k.id,
                    status: k.status === "active" ? "inactive" : "active",
                  })
                }
              >
                {k.status === "active" ? "Disable" : "Enable"}
              </Button>
            )}
            <ConfirmIconButton
              label={`Archive API key ${k.name}`}
              title="Archive API key"
              description="Are you sure you want to archive this API key? Anything using it stops working immediately, and archiving cannot be undone."
              pending={update.isPending}
              onConfirm={() => update.mutate({ id: k.id, status: "archived" })}
            >
              <Trash2 className="size-3.5" />
            </ConfirmIconButton>
          </span>
        );
      },
    },
  ];

  if (error) return <ErrorState error={error} />;
  return (
    <>
      <DataTable
        columns={columns}
        rows={keys}
        rowKey={(k) => k.id}
        loading={loading}
        empty={<EmptyState title="No API keys yet." />}
      />
      <div className="pt-3">
        <CreateKeyButton />
      </div>
    </>
  );
}
