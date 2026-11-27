"use client";

import { surfacePaths } from "@/lib/routes";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/shell/workspace-navigation";
import { Archive, ArrowUpRight, Ellipsis, Plus, Pencil } from "lucide-react";
import { useUnsavedChanges } from "@/components/shell/unsaved-changes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ORGANIZATION,
  nativeGet,
  nativeWrite,
  type ServiceAccount,
} from "@/lib/platform/native";
import { PlatformError } from "@/lib/platform/http";
import { useApiKeys } from "@/lib/platform/queries";
import { ageLabel } from "@/lib/session-trace/timing";
import { apiKeyDisplayName, apiKeyStatusLabel } from "./api-key-labels";
import { Day, DetailSkeleton, ErrorState, ListSkeleton, Time } from "./bits";
import { Breadcrumb } from "./breadcrumb";
import { IdCell } from "./copy-id";
import { ResourceInspector } from "./resource-inspector";
import {
  ArchiveServiceAccountDialog,
  useServiceAccountWrite,
} from "./service-account-dialogs";
import { ServiceAccountKeyIssuer } from "./service-account-key-issuer";

type AccountRole = ServiceAccount["organization_role"];
type AccountChanges = Partial<
  Pick<ServiceAccount, "description" | "organization_role">
>;
type FocusRef = RefObject<HTMLElement | null>;

const roles: Record<AccountRole, string> = {
  developer: "Developer",
  admin: "Admin",
};
const accountPath = (id: string) =>
  ORGANIZATION + "/service_accounts/" + encodeURIComponent(id);
const detailKey = (id: string) => ["service-accounts", "detail", id];

function useServiceAccount(id: string, refetchOnMount?: "always") {
  const client = useQueryClient();
  return useQuery<ServiceAccount | null>({
    queryKey: detailKey(id),
    refetchOnMount,
    queryFn: async ({ signal }) => {
      try {
        return await nativeGet<ServiceAccount>(
          accountPath(id),
          undefined,
          signal,
        );
      } catch (error) {
        // A later network failure must not expose a previously revoked record.
        if (
          !signal.aborted &&
          error instanceof PlatformError &&
          [401, 403, 404].includes(error.status)
        )
          client.setQueryData(detailKey(id), null);
        throw error;
      }
    },
  });
}

function useUpdateAccount(id: string) {
  return useServiceAccountWrite<AccountChanges>((changes, principal) =>
    nativeWrite<ServiceAccount>(
      accountPath(id),
      changes,
      "POST",
      false,
      principal,
    ),
  );
}

function RoleSelect({
  role,
  disabled,
  onChange,
  wide = false,
}: {
  role: AccountRole;
  disabled?: boolean;
  onChange?: (next: AccountRole) => void;
  wide?: boolean;
}) {
  return (
    <Select
      value={role}
      items={roles}
      disabled={disabled}
      onValueChange={(value) => {
        if (value) onChange?.(value);
      }}
    >
      <SelectTrigger
        aria-label="Organization role"
        className={
          wide
            ? "w-full rounded-lg border-0 bg-muted px-2 dark:bg-muted dark:hover:bg-muted/80"
            : undefined
        }
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="developer">Developer</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AccountKeys({
  id,
  panel,
  onCreate,
  createRef,
}: {
  id: string;
  panel?: boolean;
  onCreate?: () => void;
  createRef?: RefObject<HTMLButtonElement | null>;
}) {
  const query = useApiKeys();
  // principal is the key owner; created_by is the independent audit actor.
  const keys = query.data?.filter(
    (key) =>
      key.status !== "archived" &&
      key.principal?.type === "service_account_actor" &&
      key.principal.service_account_id === id,
  );
  return (
    <section aria-label="API keys" className={panel ? "pt-6" : "border-t py-5"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          API keys{" "}
          {!query.error && keys && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
              {keys.length}
            </span>
          )}
        </h2>
        {onCreate && keys && !query.error && (
          <Button
            ref={createRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onCreate}
          >
            <Plus /> Create key
          </Button>
        )}
      </div>
      <div className={panel ? "mt-1.5" : "mt-3"}>
        {query.error ? (
          <ErrorState error={query.error} />
        ) : !keys ? (
          <ListSkeleton rows={1} />
        ) : keys.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No API keys for this service account yet.
          </p>
        ) : (
          <ul className="divide-y">
            {keys.map((key) => (
              <li key={key.id}>
                <Link
                  href={`${surfacePaths["api-keys"]}?key=${encodeURIComponent(key.id)}`}
                  prefetch={false}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded py-2 text-[13px] hover:bg-muted/50"
                >
                  <span className="min-w-0 break-all font-medium">
                    {apiKeyDisplayName(key)}{" "}
                  </span>
                  <code className="text-xs text-muted-foreground">
                    {key.partial_key_hint}{" "}
                  </code>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {apiKeyStatusLabel(key.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function LoadServiceAccountForEdit({
  account,
  onLoaded,
  onClose,
  returnFocus,
}: {
  account: ServiceAccount;
  onLoaded: (current: ServiceAccount) => void;
  onClose: () => void;
  returnFocus?: FocusRef;
}) {
  const detail = useServiceAccount(account.id, "always");
  const current =
    detail.isFetchedAfterMount && detail.isSuccess && !detail.isFetching
      ? detail.data
      : null;
  useEffect(() => {
    if (current) onLoaded(current);
  }, [current, onLoaded]);

  return (
    <ResourceInspector
      kind="service-account"
      id={account.id}
      dialogLabel={account.name}
      onClose={onClose}
      returnFocus={returnFocus}
    >
      {detail.error ? (
        <>
          <div role="alert">
            <ErrorState error={detail.error} />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={detail.isFetching}
            onClick={() => void detail.refetch()}
          >
            Retry
          </Button>
        </>
      ) : (
        <DetailSkeleton />
      )}
    </ResourceInspector>
  );
}

export function ServiceAccountEditPanel({
  account,
  onClose,
  onSaved,
  returnFocus,
}: {
  account: ServiceAccount;
  onClose: () => void;
  onSaved: (account: ServiceAccount) => void;
  returnFocus?: FocusRef;
}) {
  if (account.archived_at) return null;
  return (
    <AccountEditor
      key={account.id}
      account={account}
      onClose={onClose}
      onSaved={onSaved}
      returnFocus={returnFocus}
    />
  );
}

function AccountEditor({
  account,
  onClose,
  onSaved,
  returnFocus,
}: {
  account: ServiceAccount;
  onClose: () => void;
  onSaved: (account: ServiceAccount) => void;
  returnFocus?: FocusRef;
}) {
  // Compare with the account at the start of this edit. A background refresh
  // must not silently overwrite a field the user left alone.
  const [initial] = useState(account);
  const [description, setDescription] = useState(initial.description ?? "");
  const [role, setRole] = useState(initial.organization_role);
  const update = useUpdateAccount(account.id);
  const busy = update.isPending;
  const dirtyDescription = description !== (initial.description ?? "");
  const dirtyRole = role !== initial.organization_role;
  const dirty = dirtyDescription || dirtyRole;
  const leave = useUnsavedChanges(dirty);
  const descriptionInvalid = [...description].length > 2000;
  const close = () => {
    if (!busy) leave.requestLeave(onClose);
  };

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || descriptionInvalid) return;
    if (!dirty) {
      onClose();
      return;
    }
    update.mutate(
      {
        ...(dirtyDescription && { description: description || null }),
        ...(dirtyRole && { organization_role: role }),
      },
      {
        onSuccess: (updated) => {
          leave.setDirty(false);
          onSaved(updated);
        },
      },
    );
  }

  return (
    <ResourceInspector
      kind="service-account"
      id={account.id}
      dialogLabel={account.name}
      onClose={close}
      returnFocus={returnFocus}
    >
      <div className="h-full overflow-y-auto">
        <h2 className="mb-5 break-all text-base font-medium">{account.name}</h2>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sa-edit-description">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="sa-edit-description"
              name="description"
              value={description}
              disabled={busy}
              aria-invalid={descriptionInvalid || undefined}
              aria-describedby={
                descriptionInvalid ? "sa-edit-error" : undefined
              }
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. CI/CD pipeline workloads"
              rows={3}
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive-surface"
            />
            {descriptionInvalid && (
              <p
                role="alert"
                id="sa-edit-error"
                className="text-xs text-destructive"
              >
                Description must contain at most 2000 characters.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Organization role</span>
            <RoleSelect role={role} disabled={busy} onChange={setRole} />
          </div>
          {update.error && (
            <div role="alert">
              <ErrorState error={update.error} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || descriptionInvalid}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </ResourceInspector>
  );
}

type PanelProps = {
  account: ServiceAccount;
  previous?: ServiceAccount;
  next?: ServiceAccount;
  listHref: string;
  onSelect: (account: ServiceAccount) => void;
  onClose: () => void;
  onEdit: (account: ServiceAccount) => void;
  returnFocus?: FocusRef;
  fallbackFocus?: FocusRef;
  restoreToFallback?: RefObject<boolean>;
};

export function ServiceAccountPanel({
  account,
  previous,
  next,
  listHref,
  onSelect,
  onClose,
  onEdit,
  ...focus
}: PanelProps) {
  const detail = useServiceAccount(account.id);
  return (
    <ResourceInspector
      kind="service-account"
      id={account.id}
      dialogLabel={account.name}
      previous={previous?.id}
      next={next?.id}
      onSelect={(id) => {
        const selected = id === previous?.id ? previous : next;
        if (selected) onSelect(selected);
      }}
      onClose={onClose}
      {...focus}
    >
      <div className="h-full overflow-y-auto overscroll-contain">
        {detail.data && (
          <AccountOverview
            key={detail.data.id}
            account={detail.data}
            listHref={listHref}
            onEdit={onEdit}
          />
        )}
        {detail.error && (
          <div role="alert">
            <ErrorState error={detail.error} />
          </div>
        )}
        {!detail.data && !detail.error && <DetailSkeleton />}
      </div>
    </ResourceInspector>
  );
}

function AccountOverview({
  account,
  listHref,
  onEdit,
}: Pick<PanelProps, "account" | "listHref" | "onEdit">) {
  const [issue, setIssue] = useState(false);
  const issueButton = useRef<HTMLButtonElement>(null);
  const suffix = listHref.indexOf("?");
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-all text-base font-medium">
          {account.name}
        </h2>
        <div className="flex items-center gap-1.5">
          {!account.archived_at && (
            <Button variant="outline" size="xs" onClick={() => onEdit(account)}>
              <Pencil />
              Edit
            </Button>
          )}
          <Link
            href={
              `${surfacePaths["service-accounts"]}/${encodeURIComponent(account.id)}` +
              (suffix < 0 ? "" : listHref.slice(suffix))
            }
            className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[13px] hover:bg-muted"
          >
            Open <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
      {account.archived_at && (
        <p className="mt-2 text-xs text-muted-foreground">
          Archived <Time iso={account.archived_at} />
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">
          {roles[account.organization_role]}
        </span>
        <span title={account.created_at}>
          Created {ageLabel(account.created_at)}
        </span>
      </div>
      <section aria-label="Description" className="pt-6">
        <h2 className="text-sm font-medium">Description</h2>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-muted-foreground">
          {account.description || "No description."}
        </p>
      </section>
      <AccountKeys
        id={account.id}
        panel
        createRef={issueButton}
        onCreate={account.archived_at ? undefined : () => setIssue(true)}
      />
      {issue && !account.archived_at && (
        <ServiceAccountKeyIssuer
          account={account}
          onClose={() => setIssue(false)}
          returnFocus={issueButton}
        />
      )}
    </>
  );
}

export function ServiceAccountDetail({
  id,
  listHref,
}: {
  id: string;
  listHref: string;
}) {
  const detail = useServiceAccount(id);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="pb-3">
        <Breadcrumb
          parent={{ href: listHref, label: "Service accounts" }}
          current={detail.data?.name ?? id}
        />
      </div>
      {detail.data && <AccountPage key={id} account={detail.data} />}
      {detail.error && (
        <div role="alert">
          <ErrorState error={detail.error} />
        </div>
      )}
      {!detail.data && !detail.error && <DetailSkeleton />}
    </div>
  );
}

function AccountPage({ account }: { account: ServiceAccount }) {
  const [action, setAction] = useState<"issue" | "archive" | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const issueButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const update = useUpdateAccount(account.id);
  const archived = Boolean(account.archived_at);
  const description =
    (!archived && draft !== null ? draft : account.description) ?? "";
  const dirty = !archived && description !== (account.description ?? "");
  const descriptionInvalid = dirty && [...description].length > 2000;
  const leave = useUnsavedChanges(dirty);

  function saveDescription(event: FormEvent) {
    event.preventDefault();
    if (!dirty || descriptionInvalid || update.isPending) return;
    update.mutate(
      { description: description || null },
      {
        onSuccess: () => {
          setDraft(null);
          leave.setDirty(false);
          descriptionField.current?.focus();
        },
      },
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1
            ref={title}
            tabIndex={-1}
            className="break-all font-serif text-2xl font-medium leading-7"
          >
            {account.name}
          </h1>
          {archived && (
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              Archived
            </span>
          )}
        </div>
        {!archived && (
          <DropdownMenu>
            <DropdownMenuTrigger
              ref={actionsButton}
              aria-label={"More actions for " + account.name}
              render={<Button variant="ghost" type="button" size="icon-sm" />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              finalFocus={action === "archive" ? false : actionsButton}
            >
              <DropdownMenuItem
                disabled={update.isPending}
                variant="destructive"
                onClick={() =>
                  leave.requestLeave(() => {
                    setDraft(null);
                    setAction("archive");
                  })
                }
              >
                <Archive />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          Created <Day iso={account.created_at} />
        </span>
        <IdCell id={account.id} />
      </div>
      <section aria-label="Description" className="mt-[22px]">
        <form onSubmit={saveDescription} className="space-y-2">
          <Label htmlFor="sa-page-description" className="font-normal">
            Description
          </Label>
          <textarea
            id="sa-page-description"
            ref={descriptionField}
            rows={3}
            value={description}
            readOnly={archived || update.isPending}
            aria-invalid={descriptionInvalid || undefined}
            aria-describedby={
              descriptionInvalid ? "sa-page-description-error" : undefined
            }
            onChange={(event) =>
              setDraft(
                event.target.value === (account.description ?? "")
                  ? null
                  : event.target.value,
              )
            }
            placeholder={
              archived ? "No description." : "e.g. CI/CD pipeline workloads"
            }
            className="block h-[76px] w-full resize-none rounded-lg border border-transparent bg-muted px-3 py-2 text-sm outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/20 placeholder:text-muted-foreground aria-invalid:border-destructive-surface dark:focus-visible:border-blue-400"
          />
          {descriptionInvalid && (
            <p
              role="alert"
              id="sa-page-description-error"
              className="text-xs text-destructive"
            >
              Description must contain at most 2000 characters.
            </p>
          )}
          {dirty && (
            <Button
              type="submit"
              size="sm"
              disabled={update.isPending || descriptionInvalid}
            >
              Save
            </Button>
          )}
        </form>
      </section>
      <section aria-label="Organization role" className="mt-3.5 space-y-1 pb-5">
        <h2 className="text-sm">Organization role</h2>
        <RoleSelect
          role={account.organization_role}
          wide
          disabled={archived || update.isPending}
          onChange={(organization_role) => {
            if (organization_role !== account.organization_role)
              update.mutate({ organization_role });
          }}
        />
        {update.error && (
          <div role="alert">
            <ErrorState error={update.error} />
          </div>
        )}
      </section>
      <AccountKeys
        id={account.id}
        createRef={issueButton}
        onCreate={archived ? undefined : () => setAction("issue")}
      />
      {!archived && action === "issue" && (
        <ServiceAccountKeyIssuer
          account={account}
          onClose={() => setAction(null)}
          returnFocus={issueButton}
        />
      )}
      {action === "archive" && (
        <ArchiveServiceAccountDialog
          account={account}
          onClose={() => setAction(null)}
          onArchived={() => {
            setAction(null);
            title.current?.focus();
          }}
          returnFocus={archived ? title : actionsButton}
        />
      )}
    </>
  );
}
