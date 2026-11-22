"use client";

import { useContext, useEffect, useRef, useState, type RefObject } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import {
  nativeGet,
  ORGANIZATION,
  type NativeSession,
  type ServiceAccount,
  type ServiceAccountPage,
} from "@/lib/platform/native";
import { Check, Copy, KeyRound, Plus, X } from "lucide-react";
import Link from "next/link";
import { RequestId } from "@/components/console/bits";
import { KeyCliLogin, KeyConnectionMethods } from "./api-key-connection";
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
import { useCreateApiKey } from "@/lib/platform/queries";
import { CONSOLE_WORKSPACE } from "@/lib/platform/tenancy";

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

const SELECT_CLASS =
  "h-7 w-full rounded-lg border border-transparent bg-muted px-2 text-sm disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

function ExpirySelect({
  choice,
  onChange,
  disabled,
}: {
  choice: ExpiryChoice | "";
  onChange: (choice: ExpiryChoice) => void;
  disabled: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  // Keep the projected local date current even when a draft stays open.
  // The POST still resolves its duration at submission time.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <select
      id="api-key-expires"
      data-testid="api-key-expires"
      className={SELECT_CLASS}
      value={choice}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ExpiryChoice)}
    >
      {choice === "" && (
        <option value="" disabled>
          Select an expiration
        </option>
      )}
      {EXPIRY_OPTIONS.map((option) => {
        const instant = option.hours
          ? expiryInstant(option.value, "", now)
          : undefined;
        const format: Intl.DateTimeFormatOptions =
          option.value === "3h"
            ? { hour: "numeric", minute: "2-digit" }
            : { month: "short", day: "numeric", year: "numeric" };
        return (
          <option
            key={option.value}
            value={option.value}
            data-expires-at={instant}
          >
            {instant
              ? `${option.label} (${new Date(instant).toLocaleString(undefined, format)})`
              : option.label}
          </option>
        );
      })}
    </select>
  );
}

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
  finalFocus: RefObject<HTMLElement | null>;
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
 * The Dashboard and Keys page enter the same connection flow.
 */
export function CreateKeyButton({ shortcut = false }: { shortcut?: boolean }) {
  const session = useContext(ConsoleSessionContext)?.data;
  if (
    !session?.signed_in ||
    !session.id ||
    !["admin", "developer"].includes(session.role ?? "")
  )
    return null;
  // A replaced principal (or changed role) cannot retain a draft, picker,
  // mutation observer or one-time reveal from the previous authority.
  return (
    <KeyCreation key={`${session.id}:${session.role}`} shortcut={shortcut} />
  );
}

export function KeyCreation({
  shortcut = false,
  target,
}: {
  shortcut?: boolean;
  target?: {
    account: ServiceAccount;
    onClose: () => void;
    returnFocus?: RefObject<HTMLElement | null>;
  };
}) {
  const session = useContext(ConsoleSessionContext)?.data;
  const queryClient = useQueryClient();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const finalFocus = target?.returnFocus ?? triggerRef;
  const popupRef = useRef<HTMLDivElement>(null);
  const cliButtonRef = useRef<HTMLButtonElement>(null);
  const create = useCreateApiKey();
  const [step, setStep] = useState<"connect" | "cli" | "key" | null>(
    target ? "key" : null,
  );
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<ExpiryChoice | "">(target ? "" : "30d");
  const [custom, setCustom] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [owner, setOwner] = useState(target?.account.id ?? session?.id ?? "");
  const [checking, setChecking] = useState(false);
  const submitting = useRef(false);
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
    enabled: !target && session?.role === "admin" && step === "key",
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
    target?.onClose();
  };

  // Closing also discards the lifetime and account chosen for this draft.
  const resetDraft = () => {
    setName("");
    setChoice("30d");
    setCustom("");
    setOwner(session?.id ?? "");
    setSessionError(null);
    create.reset();
  };

  const submit = async () => {
    if (
      !name ||
      !choice ||
      submitting.current ||
      customIsIncomplete(choice, custom)
    )
      return;
    let principalId: string | undefined;
    submitting.current = true;
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
        setStep(null);
        resetDraft();
        queryClient.setQueryData(["console-session"], current);
        target?.onClose();
        submitting.current = false;
        return;
      }
      if (
        current.role === "user" ||
        (owner !== current.id && current.role !== "admin")
      )
        throw new Error(
          "Your role changed. Reopen the form to select an owner.",
        );
      principalId = target?.account.id ?? (owner || current.id);
    } catch (error) {
      submitting.current = false;
      if (active.current) setSessionError(error);
      return;
    } finally {
      if (active.current) setChecking(false);
    }
    const expiresAt = expiryInstant(choice, custom, Date.now());
    create.mutate(
      // Absent rather than null for "never": both mean the same to the
      // platform, and absent is what the reference sends.
      {
        name,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
        ...(principalId ? { principal_id: principalId } : {}),
      },
      {
        onSuccess: (issued) => {
          setSecret(issued.raw_key);
          setStep(null);
          setName("");
          setChoice("30d");
          setCustom("");
        },
        onSettled: () => {
          submitting.current = false;
        },
        // `create.reset()` is deliberately NOT called here: it would clear the
        // mutation before the reveal dialog has rendered from it.
      },
    );
  };

  const error = sessionError ?? create.error;
  const incomplete = !name || !choice || customIsIncomplete(choice, custom);
  return (
    <>
      {!target && (
        <Button
          ref={triggerRef}
          size="sm"
          variant={shortcut ? "secondary" : "default"}
          onClick={() => {
            resetDraft();
            setStep("connect");
          }}
        >
          {shortcut ? (
            <KeyRound className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {shortcut ? "Get API key" : "Create key"}
        </Button>
      )}

      <Dialog
        open={step !== null}
        onOpenChange={(next) => {
          // Closing a pending POST would lose its one-time plaintext response.
          if (next || pending) return;
          setStep(null);
          resetDraft();
          target?.onClose();
        }}
      >
        <DialogContent
          ref={popupRef}
          initialFocus={() =>
            target
              ? popupRef.current?.querySelector<HTMLInputElement>(
                  "#api-key-name",
                )
              : popupRef.current?.querySelector<HTMLButtonElement>(
                  '[data-slot="dialog-close"]',
                )
          }
          finalFocus={secret ? false : finalFocus}
          showCloseButton={!pending}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px]"
        >
          {step === "connect" && (
            <KeyConnectionMethods
              cliButtonRef={cliButtonRef}
              onCli={() => setStep("cli")}
              onKey={() => setStep("key")}
            />
          )}
          {step === "cli" && (
            <KeyCliLogin
              onBack={() => {
                setStep("connect");
                requestAnimationFrame(() => cliButtonRef.current?.focus());
              }}
            />
          )}
          {step === "key" && (
            <form
              aria-label="Create API key"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <DialogHeader>
                <DialogTitle className="text-[15px]">
                  Create API key
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Choose a name, lifetime, and linked account for this key.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="api-key-name">Name</Label>
                  <Input
                    id="api-key-name"
                    className="h-7 border-transparent bg-muted focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/20 dark:bg-muted dark:focus-visible:border-blue-400"
                    value={name}
                    disabled={pending}
                    autoFocus
                    placeholder="my-dev-key"
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="api-key-expires">Expires</Label>
                  <ExpirySelect
                    choice={choice}
                    onChange={setChoice}
                    disabled={pending}
                  />
                  {/* "Never" is the one choice that cannot be undone by waiting,
                    so it says so rather than merely being styled as danger —
                    the reference's red is doing the same job with less. */}
                  {choice === "never" && (
                    <p
                      data-testid="never-expires-warning"
                      className="text-[13px] text-destructive"
                    >
                      No time limit. Disabling or deleting this key, or
                      deactivating its owner, revokes access.
                    </p>
                  )}
                  {choice === "custom" && (
                    <Input
                      type="datetime-local"
                      disabled={pending}
                      aria-label="Custom expiry"
                      data-testid="api-key-custom-expiry"
                      value={custom}
                      onChange={(event) => setCustom(event.target.value)}
                    />
                  )}
                </div>
                {target ? (
                  <div className="space-y-2 text-sm">
                    <p>This key acts as</p>
                    <div className="rounded-lg border p-3">
                      <p className="font-medium break-all">
                        {target.account.name}
                      </p>
                      <p className="text-muted-foreground">Service account</p>
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      Requests with this key inherit the service account’s
                      access.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <Label htmlFor="api-key-owner">Linked account</Label>
                      {session?.role === "admin" &&
                        accounts.isSuccess &&
                        !pending && (
                          <Link
                            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                            href="/service-accounts"
                            target="_blank"
                            rel="noopener noreferrer"
                            prefetch={false}
                          >
                            Manage service accounts
                            <span className="sr-only">
                              {" "}
                              (opens in a new tab)
                            </span>
                          </Link>
                        )}
                    </div>
                    <select
                      id="api-key-owner"
                      aria-describedby="key-owner-description"
                      className={SELECT_CLASS}
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
                    <p
                      id="key-owner-description"
                      className="text-[13px] text-muted-foreground"
                    >
                      {owner === session?.id
                        ? "Requests with this key act as you. Deactivating your account revokes access."
                        : "Requests with this key act as the service account. Archiving that account revokes access."}
                    </p>
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
                  <Label htmlFor="api-key-scope">Scope</Label>
                  <select
                    id="api-key-scope"
                    className={SELECT_CLASS}
                    value={CONSOLE_WORKSPACE}
                    disabled
                    aria-describedby="key-scope-description"
                  >
                    <option value={CONSOLE_WORKSPACE}>Default workspace</option>
                  </select>
                  <p
                    id="key-scope-description"
                    className="text-[13px] text-muted-foreground"
                  >
                    This installation uses the default workspace.
                  </p>
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
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || incomplete}
                >
                  {target ? "Add" : "Create key"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {secret !== null && (
        <RevealKeyDialog
          secret={secret}
          onClose={discardSecret}
          finalFocus={finalFocus}
        />
      )}
    </>
  );
}

export { ApiKeysTable } from "./api-key-list";
