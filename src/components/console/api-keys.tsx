"use client";

import { useContext, useEffect, useRef, useState, type RefObject } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import {
  nativeGet,
  ORGANIZATION,
  type NativeSession,
  type ServiceAccountPage,
} from "@/lib/platform/native";
import { Check, Copy, KeyRound, Plus, X } from "lucide-react";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  Day,
  IdCode,
  EmptyState,
  ErrorState,
  RequestId,
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
import { ResourceActions } from "@/components/console/resource-actions";
import {
  ModelAccessButton,
  RemovePolicyButton,
  ModelAccessCell,
} from "@/components/console/model-access";
import { copyText } from "@/lib/copy-text";
import { cn } from "@/lib/utils";
import { PlatformError, isNativeConsole } from "@/lib/platform/http";
import { useCreateApiKey, useUpdateApiKey } from "@/lib/platform/queries";
import { useGatewayKeyPolicies } from "@/lib/platform/gateway-queries";
import { isUnimplemented } from "@/lib/platform/surfaces";
import { CONSOLE_WORKSPACE } from "@/lib/platform/tenancy";
import type { ApiKeyListItem } from "@/lib/platform/types";

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
 * and it matters here too: this is a bearer credential. The value
 * is not written to a `data-*` attribute, not logged, not put in a toast, not
 * stored, and passed nowhere but this block and the clipboard.
 */
function RevealKeyDialog({
  secret,
  onClose,
  finalFocus,
}: {
  secret: string;
  onClose: () => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>Save your API key</DialogTitle>
          <DialogDescription>
            Keep a record of the key below. You won&apos;t be able to view it
            again.
          </DialogDescription>
        </DialogHeader>
        <pre
          data-testid="revealed-api-key"
          className="min-w-0 rounded-md border bg-secondary/40 p-3 font-mono text-[12px] break-all whitespace-pre-wrap"
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

/**
 * Create, then reveal — one control, two dialogs, the reference's sequence.
 *
 * The Dashboard shortcut uses the same sequence as the API keys list.
 */
export function CreateKeyButton({ shortcut = false }: { shortcut?: boolean }) {
  const session = useContext(ConsoleSessionContext)?.data;
  const native = isNativeConsole();
  if (
    native &&
    (!session?.signed_in ||
      !session.id ||
      !["admin", "developer"].includes(session.role ?? ""))
  )
    return null;
  // A replaced principal (or changed role) cannot retain a draft, picker,
  // mutation observer or one-time reveal from the previous authority.
  return (
    <KeyCreation
      key={native ? `${session?.id}:${session?.role}` : "legacy"}
      shortcut={shortcut}
    />
  );
}

function KeyCreation({ shortcut }: { shortcut: boolean }) {
  const session = useContext(ConsoleSessionContext)?.data;
  const native = isNativeConsole();
  const queryClient = useQueryClient();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const create = useCreateApiKey();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<ExpiryChoice>("30d");
  const [custom, setCustom] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [owner, setOwner] = useState(session?.id ?? "");
  const [checking, setChecking] = useState(false);
  const [sessionError, setSessionError] = useState<unknown>(null);
  const accounts = useInfiniteQuery({
    queryKey: ["key-owner-service-accounts", session?.id, session?.role],
    queryFn: ({ pageParam }) =>
      nativeGet<ServiceAccountPage>(`${ORGANIZATION}/service_accounts`, {
        page: pageParam,
        limit: 100,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_page ?? undefined,
    enabled: native && session?.role === "admin" && open,
    gcTime: 0,
    // This observer stays mounted while closed. Re-enable must read the directory
    // again: an account can be created or archived without leaving this page.
    staleTime: 0,
    retry: false,
  });
  const services =
    accounts.data?.pages
      .flatMap((page) => page.data)
      .filter((account) => !account.archived_at) ?? [];
  const pending = create.isPending || checking;

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
    setOwner(session?.id ?? "");
    setSessionError(null);
    create.reset();
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || customIsIncomplete(choice, custom)) return;
    let principalId: string | undefined;
    if (native) {
      setChecking(true);
      setSessionError(null);
      try {
        const current = await nativeGet<NativeSession>("/api/auth/session");
        if (!active.current) return;
        if (
          !current.signed_in ||
          current.id !== session?.id ||
          current.role !== session?.role
        ) {
          setOpen(false);
          resetDraft();
          queryClient.setQueryData(["console-session"], current);
          return;
        }
        if (
          current.role === "user" ||
          (owner !== current.id && current.role !== "admin")
        )
          throw new Error(
            "Your role changed. Reopen the form to select an owner.",
          );
        principalId = owner || current.id;
      } catch (error) {
        if (active.current) setSessionError(error);
        return;
      } finally {
        if (active.current) setChecking(false);
      }
    }
    const expiresAt = expiryInstant(choice, custom, Date.now());
    create.mutate(
      // Absent rather than null for "never": both mean the same to the
      // platform, and absent is what the reference sends.
      {
        name: trimmed,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
        ...(principalId ? { principal_id: principalId } : {}),
      },
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

  const error = sessionError ?? create.error;
  const incomplete = !name.trim() || customIsIncomplete(choice, custom);
  return (
    <>
      <Button
        ref={triggerRef}
        size={shortcut ? "default" : "sm"}
        variant={shortcut ? "outline" : "default"}
        className="h-8"
        onClick={() => {
          resetDraft();
          setOpen(true);
        }}
      >
        {shortcut ? (
          <KeyRound className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
        {shortcut ? "Get API key" : "Create key"}
      </Button>

      {/* Dismissal is refused while the POST is in flight, for the reason plan
          07 slice 3 recorded: the platform mints the key when the request
          lands, and a dismissal detaches the handler that captures the
          plaintext — leaving a live credential nobody has ever seen.

          What this does NOT cover, deliberately, is a route navigation in the
          same window — Back, or a nav click, in the sub-second a POST is in
          flight. The capture is observer-scoped, so unmounting loses it there
          too. It is left uncovered because the outcome differs from the
          environment-key case that motivated the guard: that issuance response
          identified no row at all, so a lost plaintext meant a credential the
          operator could not pick out of a list and could only revoke blind.
          Here the minted key appears in the listing under the name they typed,
          with its hint and creation time, and Delete is in that row's menu.
          Closing the gap properly would mean holding the plaintext in
          module state across a navigation so it could be shown on return —
          a second storage path for the one value this file exists to render
          exactly once, which the probe below treats as a defect. */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && pending) return;
          setOpen(next);
          if (!next) resetDraft();
        }}
      >
        <DialogContent finalFocus={secret ? false : triggerRef}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                {native
                  ? "An owned key uses its owner’s current role. Deactivating the owner revokes access."
                  : "The platform assigns ownership from the issuing identity. Owned keys use their owner’s current role; unowned keys retain legacy authority."}
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
              {native && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="api-key-owner">Owner</Label>
                  <select
                    id="api-key-owner"
                    className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                    disabled={pending || session?.role !== "admin"}
                  >
                    <option value={session?.id}>
                      You ·{" "}
                      {session?.name || session?.login_name || session?.id}
                    </option>
                    {owner !== session?.id &&
                      !services.some((account) => account.id === owner) && (
                        <option value={owner} disabled>
                          Selected account not in current list · {owner}
                        </option>
                      )}
                    {services.map((account) => (
                      <option key={account.id} value={account.id}>
                        Service account · {account.name || account.id}
                      </option>
                    ))}
                  </select>
                  {accounts.isFetching && (
                    <p
                      role="status"
                      className="text-[13px] text-muted-foreground"
                    >
                      Loading service accounts…
                    </p>
                  )}
                  {accounts.error && (
                    <p role="alert" className="text-[13px] text-destructive">
                      {accounts.error.message}
                    </p>
                  )}
                  {/* A cold retry clears error; a cached refetch retains it.
                      Keep recovery mounted and disabled during either request. */}
                  {((accounts.isFetched && !accounts.data) ||
                    accounts.isRefetchError) && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={accounts.isFetching || pending}
                      onClick={() => void accounts.refetch()}
                    >
                      Retry
                    </Button>
                  )}
                  {accounts.hasNextPage && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={accounts.isFetching || pending}
                      onClick={() => void accounts.fetchNextPage()}
                    >
                      Load more service accounts
                    </Button>
                  )}
                </div>
              )}
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
                    {native
                      ? "No time limit. Disabling or deleting this key, or deactivating its owner, revokes access."
                      : "No time limit. Disabling or deleting this key revokes access."}
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
                disabled={pending}
                onClick={() => {
                  // Through the same door as every other close: setting `open`
                  // alone would skip `onOpenChange` and leave the draft behind.
                  setOpen(false);
                  resetDraft();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || incomplete}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {secret !== null && (
        <RevealKeyDialog
          secret={secret}
          onClose={discardSecret}
          finalFocus={triggerRef}
        />
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
 * wire carries instead of a display name over an email. It does not fetch an
 * admin-only directory to enrich developer rows.
 */
export function ApiKeysTable({
  keys,
  loading,
  error,
}: {
  keys: ApiKeyListItem[];
  loading: boolean;
  error: unknown;
}) {
  const session = useContext(ConsoleSessionContext)?.data;
  const canWritePolicies = !isNativeConsole() || session?.role === "admin";
  const update = useUpdateApiKey();
  // Model access is the model gateway's (plan 10); a console without one
  // answers 404 and the column goes. While unknown, it shows.
  const policies = useGatewayKeyPolicies();
  const gateway = !isUnimplemented(policies.error);
  const policyList = policies.data?.data;

  const columns: Column<ApiKeyListItem>[] = [
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
      key: "owner",
      header: "Owner",
      cell: (key) => {
        const owner = key.principal;
        const id =
          owner?.type === "user_actor"
            ? owner.user_id
            : owner?.service_account_id;
        return (
          <span
            className="flex flex-col text-[13px]"
            data-owner-id={id ?? ""}
            data-owner-type={owner?.type ?? ""}
          >
            <span>
              {owner
                ? owner.type === "user_actor"
                  ? "User"
                  : "Service account"
                : "Unowned"}
            </span>
            {id && <IdCode id={id} />}
          </span>
        );
      },
    },
    {
      key: "created_by",
      header: "Created by",
      cell: (k) => (
        <span
          className="flex flex-col whitespace-nowrap text-[13px]"
          data-created-by={k.created_by?.id ?? ""}
          data-created-by-type={k.created_by?.type ?? ""}
        >
          {k.created_by ? (
            <>
              <span>
                {k.created_by.type === "user"
                  ? "User"
                  : k.created_by.type === "api_key"
                    ? "API key"
                    : "Principal"}
              </span>
              <IdCode id={k.created_by.id} />
            </>
          ) : (
            "Control plane"
          )}
        </span>
      ),
    },
    ...(gateway
      ? [
          {
            key: "model_access",
            header: "Model access",
            cell: (k: ApiKeyListItem) => (
              <ModelAccessCell
                apiKey={k}
                policies={policyList}
                loading={policies.isPending}
              />
            ),
          },
        ]
      : []),
    {
      key: "created",
      header: "Created",
      cell: (k) => <Day iso={k.created_at} />,
    },
    {
      key: "expires",
      header: "Expires",
      cell: (k) => (
        <span data-expires-at={k.expires_at ?? ""}>
          {k.expires_at ? <Day iso={k.expires_at} /> : "Never"}
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
      header: "Actions",
      cell: (k) => {
        // A key the control plane manages has no issuer, and the platform
        // refuses every mutation on it: its lifecycle is rotation-by-restart.
        // Showing controls that are guaranteed to 400 would be a worse lie than
        // showing none, and this is a mirror of the wire rather than a rule
        // stricter than it. A gateway policy on such a key is not the key,
        // and stays removable.
        const policy = policyList?.find((p) => p.api_key_id === k.id);
        const policyControl = gateway && canWritePolicies && !k.principal;
        const manageable = k.can_manage ?? (!k.principal && !!k.created_by);
        if (!k.created_by)
          return policyControl && policy ? (
            <span className="flex justify-end">
              <RemovePolicyButton apiKey={k} />
            </span>
          ) : null;
        // Archived is terminal on this surface, and an expired key admits
        // exactly one operation — archiving it. Both are the platform's rules,
        // stated in its refusals. Archiving leaves the gateway's policy, which
        // blocks deleting any model it names, so its removal stays offered;
        // neither key is offered a grant, which could only block that.
        if (!manageable) return null;
        if (k.status === "archived")
          return policyControl && policy ? (
            <span className="flex justify-end">
              <RemovePolicyButton apiKey={k} />
            </span>
          ) : null;
        const expired = k.status === "expired";
        return (
          <span className="flex items-center justify-end gap-1">
            {policyControl && policyList && !expired && (
              <ModelAccessButton apiKey={k} policy={policy} />
            )}
            {policyControl && expired && policy && (
              <RemovePolicyButton apiKey={k} />
            )}
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
            <ResourceActions
              resource="API key"
              menuLabel={`More actions for ${k.name}`}
              deleteDescription={`Delete API key “${k.name}”? Anything using it stops working immediately. This action cannot be undone.`}
              deletePending={update.isPending}
              // The platform's delete is a terminal status update, not DELETE
              // (internal/api/consoleapikeys.go, updateAPIKeyIn).
              onDelete={() => update.mutate({ id: k.id, status: "archived" })}
            />
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
      {keys.some((key) => !key.created_by) && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Keys managed by the control plane cannot be deleted here. Rotate them
          in the deployment configuration.
        </p>
      )}
    </>
  );
}
