"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Trash2, X } from "lucide-react";
import { DetailSection } from "@/components/console/detail";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  EmptyState,
  ErrorState,
  IdCode,
  RequestId,
  Time,
} from "@/components/console/bits";
import { ConfirmIconButton } from "@/components/console/archive-button";
import { EnvironmentKeySetup } from "@/components/console/environment-key-setup";
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
import { copyText } from "@/lib/copy-text";
import { PlatformError } from "@/lib/platform/http";
import {
  useCreateEnvironmentKey,
  useEnvironmentKeys,
  useEnvironmentStillExists,
  useRevokeEnvironmentKey,
} from "@/lib/platform/queries";
import { useNow } from "@/lib/session-trace/use-now";
import { isUnimplemented } from "@/lib/platform/surfaces";
import type { Environment, EnvironmentKey } from "@/lib/platform/types";

/**
 * Active or expired, derived from `expires_at` against a caller-supplied clock.
 *
 * The platform lists expired keys deliberately — "an operator whose worker has
 * stopped connecting needs to see the credential it is failing on"
 * (`internal/api/envkeys.go:102-106`) — so the console has to say which is
 * which. That is a rendering derivation, not domain logic (principle 4), but it
 * owns a clock, so `now` is a parameter rather than a `Date.now()` buried in a
 * branch.
 *
 * A null `expires_at` is a key that does not expire. Our platform assigns every
 * key a one-year lifetime today, so this arm is unreachable through issuance —
 * it exists because the column is nullable on the wire and a row that says
 * "never" must not read as "expired".
 */
export function environmentKeyState(
  expiresAt: string | null | undefined,
  now: number,
): "active" | "expired" {
  if (!expiresAt) return "active";
  const parsed = Date.parse(expiresAt);
  // An unparseable timestamp is not evidence of expiry.
  if (Number.isNaN(parsed)) return "active";
  return parsed <= now ? "expired" : "active";
}

/**
 * Whether this environment can be issued a key at all.
 *
 * The platform refuses both cases with a 400 — a non-`self_hosted` environment
 * because its work is run by the platform's own executor, which holds no
 * environment key, and an archived one outright
 * (`internal/api/consoleapi.go:200-205`). Hiding the control rather than
 * letting an operator discover the refusal mirrors the reference, and is a
 * client-side mirror of the wire rather than a rule stricter than it.
 */
export function canIssueEnvironmentKey(environment: Environment): boolean {
  return (
    environment.config.type === "self_hosted" && environment.archived_at == null
  );
}

/**
 * The reveal-once dialog: the only place the plaintext key is ever rendered.
 *
 * The platform returns it on create and never again, and returns no row
 * metadata with it (`consoleapi.go:74-79`), so there is nothing here to render
 * a table row from and nothing to look the key up by later. The discipline
 * that follows is the point of this component, and a reviewer should treat any
 * second render path for `secret` as a defect: it is not written to a `data-*`
 * attribute, not logged, not put in a toast, not stored, and not passed
 * anywhere but this dialog's own mono block and the clipboard the operator
 * asks for.
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
          <DialogTitle>Save your environment key</DialogTitle>
          <DialogDescription>
            Keep a record of the key below. You won&apos;t be able to view it
            again.
          </DialogDescription>
        </DialogHeader>
        {/* `break-all` rather than a scroll: this is the one value an
            operator must copy correctly, and a key whose tail sits outside a
            scroll box is a key half of them will paste truncated. */}
        <pre
          data-testid="revealed-key"
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
            Copy environment key
          </Button>
          {/* Radix gives DialogContent its own sr-only "Close" control, so
              this one carries a testid rather than being addressed by name. */}
          <Button data-testid="close-revealed-key" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Generate, then reveal. One control, two dialogs: the name prompt swaps for
 * the reveal on success, which is the reference's own sequence.
 *
 * Errors show inline rather than as a toast — the operator is looking at a
 * modal, and a toast behind it is a message delivered to nobody. That is what
 * `useCreateEnvironmentKey`'s `errorToast: false` is for.
 */
function GenerateKeyButton({ environmentId }: { environmentId: string }) {
  const create = useCreateEnvironmentKey(environmentId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  /** Clears the plaintext from component state *and* the mutation cache. */
  const discardSecret = () => {
    setSecret(null);
    create.reset();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (issued) => {
          setSecret(issued.access_token);
          setOpen(false);
          setName("");
        },
      },
    );
  };

  const error = create.error;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => {
          create.reset();
          setOpen(true);
        }}
      >
        <KeyRound className="size-4" /> Generate environment key
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setName("");
            create.reset();
          }
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
              <DialogTitle>Create environment key</DialogTitle>
              <DialogDescription>
                Give your environment key a name to help identify it later.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-4">
              <Label htmlFor="environment-key-name">Name</Label>
              <Input
                id="environment-key-name"
                value={name}
                autoFocus
                placeholder="e.g., Production Server"
                onChange={(event) => setName(event.target.value)}
              />
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
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending || name.trim().length === 0}
              >
                Create environment key
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
 * The environment-key section of the environment detail page.
 *
 * Rendered only for `self_hosted` environments, matching the reference: a cloud
 * environment has no worker to hold a key. An *archived* self-hosted
 * environment still shows its section, because the platform still serves and
 * still revokes those keys (`consoleapi.go:122-126`) — an operator who archives
 * an environment needs the credentials it handed out to be revocable, not
 * invisible.
 */
export function EnvironmentKeysSection({
  environment,
}: {
  environment: Environment;
}) {
  const selfHosted = environment.config.type === "self_hosted";
  const keys = useEnvironmentKeys(environment.id, selfHosted);
  const revoke = useRevokeEnvironmentKey(environment.id);
  // The repo's existing clock, rather than a `Date.now()` in render: it keeps
  // this component pure, and a key that expires while the page sits open flips
  // to Expired on its own instead of lying until a reload.
  const now = useNow();

  // Seam 6 — feature detection on a route that carries an id.
  //
  // `isUnimplemented` is documented as valid only on collection routes, because
  // elsewhere a 404 could be the id rather than the endpoint, and this route
  // carries an environment id. Two things can answer 404 here: the router
  // catch-all on a platform predating plan 30 (`server.go:152`), and
  // `consoleEnvironment` on an environment that is gone
  // (`consoleapi.go:127-142`).
  //
  // Having loaded the environment is not enough to rule the second one out —
  // an environment is mutable, and another operator can delete it while this
  // page is open, which would then render as "this deployment lacks the
  // feature". So the 404 is not read as feature-absence until a re-read of the
  // environment confirms it is still there. The re-read runs only on that
  // 404, so a platform that serves the surface never pays for it.
  const maybeUnimplemented =
    selfHosted && keys.error != null && isUnimplemented(keys.error);
  const stillExists = useEnvironmentStillExists(
    environment.id,
    maybeUnimplemented,
  );

  if (!selfHosted) return null;

  // Only a confirmed-live environment licenses hiding. A deleted one, or a
  // re-read that failed, keeps the error visible — the fail-safe direction,
  // since a wrongly shown error is a nuisance and a wrongly hidden surface is
  // a lie.
  if (maybeUnimplemented && stillExists.data === true) return null;
  // While the re-read is in flight the answer is not known yet; showing the
  // error and then hiding it would flash a failure that was never real.
  const deciding = maybeUnimplemented && stillExists.isPending;

  const columns: Column<EnvironmentKey>[] = [
    { key: "name", header: "Name", className: "w-full", cell: (k) => k.name },
    {
      key: "id",
      header: "ID",
      cell: (k) => (
        <span data-token-id={k.id}>
          <IdCode id={k.id} />
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
      cell: (k) => {
        const state = environmentKeyState(k.expires_at, now);
        return (
          <span
            className="flex items-center gap-2 whitespace-nowrap"
            data-expires-at={k.expires_at ?? ""}
            data-key-state={state}
          >
            <Time iso={k.expires_at} />
            {state === "expired" && (
              <Badge variant="outline" className="font-normal">
                Expired
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      cell: (k) => (
        <ConfirmIconButton
          label={`Revoke environment key ${k.name}`}
          title="Revoke environment key"
          description="Are you sure you want to revoke this environment key? Workers using this key will no longer be able to connect. This action cannot be undone."
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate(k.id)}
        >
          <Trash2 className="size-3.5" />
        </ConfirmIconButton>
      ),
    },
  ];

  const page = keys.data;
  const canIssue = canIssueEnvironmentKey(environment);
  return (
    <DetailSection title="Environment keys">
      {/* Two columns, matching the reference: the table and its control on the
          left, the setup guide beside them rather than below. Stacks on narrow
          viewports, where side-by-side would squeeze both. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <p className="pb-3 text-[13px] text-muted-foreground">
            An environment key lets a runner on your infrastructure connect to
            this environment and pull jobs. Generate one per host so you can
            revoke access individually.
          </p>
          {keys.error && !deciding ? (
            <ErrorState error={keys.error} />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={page?.data ?? []}
                rowKey={(k) => k.id}
                loading={keys.isPending || deciding}
                empty={<EmptyState title="No environment keys yet." />}
              />
              {/* The platform caps a page at 100 and the console asks for
                  exactly that (consoleapi.go:62), so this line is the only way
                  an operator with more keys than that learns the list is not
                  the whole list. A pager for a surface whose realistic size is
                  "one per host" would be machinery nobody asked for; saying so
                  plainly is not. */}
              {page?.pagination.has_more && (
                <p
                  className="pt-2 text-[13px] text-muted-foreground"
                  data-has-more="true"
                  data-total-keys={page.pagination.total}
                >
                  Showing the first {page.data.length} of{" "}
                  {page.pagination.total} keys.
                </p>
              )}
              {/* Hidden for the two cases the platform refuses outright, so an
                  operator does not discover the 400 by hitting it. An archived
                  environment keeps its table and its revoke controls. */}
              {canIssue && (
                <div className="pt-3">
                  <GenerateKeyButton environmentId={environment.id} />
                </div>
              )}
            </>
          )}
        </div>
        {canIssue && (
          <div className="w-full shrink-0 lg:max-w-md">
            <EnvironmentKeySetup environmentId={environment.id} />
          </div>
        )}
      </div>
    </DetailSection>
  );
}
