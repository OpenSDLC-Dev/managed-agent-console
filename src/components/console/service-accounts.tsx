"use client";

import { surfacePaths } from "@/lib/routes";
import { useContext, useRef, useState } from "react";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import {
  Archive,
  Ellipsis,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shield,
  X,
} from "lucide-react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ORGANIZATION,
  nativeGet,
  type ServiceAccount,
  type ServiceAccountPage,
} from "@/lib/platform/native";
import { PlatformError } from "@/lib/platform/http";
import { useListFilters } from "@/lib/use-list-filters";
import { Day, ErrorState, Time } from "./bits";
import { IdCell } from "./copy-id";
import {
  ArchiveServiceAccountDialog,
  CreateServiceAccountDialog,
} from "./service-account-dialogs";
import {
  LoadServiceAccountForEdit,
  ServiceAccountEditPanel,
  ServiceAccountPanel,
} from "./service-account-detail";
import { ServiceAccountKeyIssuer } from "./service-account-key-issuer";

async function readDirectory(archived: boolean, signal: AbortSignal) {
  const accounts = new Map<string, ServiceAccount>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page: ServiceAccountPage = await nativeGet(
      `${ORGANIZATION}/service_accounts`,
      {
        limit: 100,
        page: cursor,
        include_archived: archived,
      },
      signal,
    );
    for (const account of page.data) {
      if (Boolean(account.archived_at) === archived)
        accounts.set(account.id, account);
    }
    cursor = page.next_page ?? undefined;
    if (cursor) {
      if (cursors.has(cursor))
        throw new Error(
          "The service account list returned a repeated page cursor.",
        );
      cursors.add(cursor);
    }
  } while (cursor);
  return [...accounts.values()];
}

type RowAction = "edit" | "archive" | "key";
function AccountActions({
  account,
  disabled,
  onAction,
}: {
  account: ServiceAccount;
  disabled: boolean;
  onAction: (action: RowAction, trigger: HTMLButtonElement | null) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const opening = useRef(false);
  const act = (action: RowAction) => {
    if (disabled) return;
    opening.current = true;
    onAction(action, trigger.current);
  };
  return (
    <DropdownMenu
      onOpenChange={(open, details) => {
        if (open && disabled) details.cancel();
        else if (open) opening.current = false;
      }}
    >
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={`More actions for ${account.name}`}
        aria-disabled={disabled || undefined}
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 text-muted-foreground"
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-40"
        finalFocus={() => (opening.current ? false : trigger.current)}
      >
        <DropdownMenuItem onClick={() => act("edit")}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => act("key")}>
          <KeyRound />
          Create API key
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => act("archive")}>
          <Archive />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Selection = {
  account: ServiceAccount;
  mode: "view" | "load-edit" | "edit";
  directoryUpdatedAt: number;
};
type Modal =
  { kind: "create" } | { kind: "key" | "archive"; account: ServiceAccount };

export function ServiceAccounts() {
  const session = useContext(ConsoleSessionContext)?.data;
  return <Directory key={`${session?.id}:${session?.role}`} />;
}

function Directory() {
  const filters = useListFilters();
  const archived = filters.params.get("status") === "archived";
  const query = filters.params.get("q") ?? "";
  const directory = useQuery({
    queryKey: ["service-accounts", "directory", archived],
    queryFn: ({ signal }) => readDirectory(archived, signal),
  });
  const pending =
    useIsMutating({ mutationKey: ["service-accounts", "write"] }) > 0;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const create = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement>(null);
  const needle = query.trim().toLowerCase();
  const accounts = directory.data ?? [];
  const rows = accounts.filter(
    (a) =>
      !needle ||
      [a.id, a.name, a.description ?? ""].some((v) =>
        v.toLowerCase().includes(needle),
      ),
  );
  const selected = selection?.account;
  const index = rows.findIndex((a) => a.id === selected?.id);
  const denied =
    directory.error instanceof PlatformError &&
    [401, 403, 404].includes(directory.error.status);
  const settledDirectory = directory.isSuccess && !directory.isFetching;
  // The directory can still predate a just-created account. A later complete
  // directory can remove it; a text search or a transient read error cannot.
  if (
    selection &&
    (denied ||
      (settledDirectory &&
        directory.dataUpdatedAt !== selection.directoryUpdatedAt &&
        !accounts.some((a) => a.id === selection.account.id)))
  ) {
    setSelection(null);
  }
  if (
    modal &&
    (denied ||
      (modal.kind !== "create" &&
        !pending &&
        settledDirectory &&
        !accounts.some((a) => a.id === modal.account.id)))
  ) {
    setModal(null);
  }
  const editing = selection?.mode === "edit" || selection?.mode === "load-edit";
  const busy = pending || editing || !!modal || denied;
  const listHref = `${surfacePaths["service-accounts"]}${filters.key ? `?${filters.key}` : ""}`;
  const select = (account: ServiceAccount, mode: Selection["mode"] = "view") =>
    setSelection({
      account,
      mode,
      directoryUpdatedAt: directory.dataUpdatedAt,
    });
  function changeQuery(value: string) {
    opener.current = search.current;
    setSelection(null);
    filters.update({ q: value || null }, "replace");
  }
  function created(account: ServiceAccount) {
    setModal(null);
    filters.update({ status: null, q: null }, "replace");
    opener.current = create.current;
    select(account);
  }
  const header = [
    "ID",
    "Name",
    "Role",
    "Created",
    archived ? "Archived" : "Actions",
  ];
  return (
    <div className="sm:-mx-2">
      <div
        inert={editing || undefined}
        onClick={(event) => {
          if (
            selection?.mode === "view" &&
            !(event.target as Element).closest(
              "tr[data-account-id], [role=menu], button, a, input, label",
            )
          )
            setSelection(null);
        }}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-[24px] font-medium leading-7">
              Service accounts
            </h1>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              Named non-human identities for workloads and automation.
            </p>
          </div>
          <Button
            ref={create}
            size="sm"
            className="h-7"
            focusableWhenDisabled
            disabled={busy}
            onClick={() => {
              if (!busy) {
                setSelection(null);
                setModal({ kind: "create" });
              }
            }}
          >
            <Plus />
            Create service account
          </Button>
        </header>
        <div
          role="toolbar"
          aria-label="Service account filters"
          className="mt-8 flex flex-wrap items-center gap-2"
        >
          <div className="relative w-full sm:w-80">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={search}
              aria-label="Search service accounts"
              placeholder="Search service accounts"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              className="h-7 border-transparent bg-muted pr-8 pl-9 text-sm focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/20 dark:bg-muted dark:focus-visible:border-blue-400"
            />
            {query && (
              <button
                aria-label="Clear search"
                type="button"
                onClick={() => {
                  changeQuery("");
                  search.current?.focus();
                }}
                className="absolute inset-y-0 right-1 flex w-7 items-center justify-center rounded text-muted-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div
            role="radiogroup"
            aria-label="Archive filter"
            className="flex h-7 items-center rounded-lg bg-muted p-0.5"
          >
            {([false, true] as const).map((value) => (
              <label key={String(value)} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="service-account-status"
                  className="peer sr-only"
                  checked={value === archived}
                  onChange={(event) => {
                    opener.current = event.currentTarget;
                    setSelection(null);
                    filters.update({ status: value ? "archived" : null });
                  }}
                />
                <span className="block rounded-md px-3 text-sm leading-6 text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-ring dark:peer-checked:bg-foreground/15">
                  {value ? "Archived" : "Active"}
                </span>
              </label>
            ))}
          </div>
        </div>
        {directory.error ? (
          <>
            <ErrorState error={directory.error} />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void directory.refetch()}
            >
              Retry
            </Button>
          </>
        ) : (
          <div className="mt-5">
            <Table
              aria-label="Service accounts"
              className="min-w-[580px] table-fixed"
            >
              <colgroup>
                <col className="w-[24%] lg:w-[272px]" />
                <col />
                <col className="w-[16%] lg:w-[120px]" />
                <col className="w-[19%] lg:w-[135px]" />
                <col className={archived ? "w-[19%] lg:w-[120px]" : "w-11"} />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {header.map((label) => (
                    <TableHead
                      key={label}
                      scope="col"
                      className="h-8 px-2 text-[13px] font-normal text-muted-foreground first:pl-0"
                    >
                      {label === "Actions" ? (
                        <span className="sr-only">Actions</span>
                      ) : (
                        label
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody aria-busy={directory.isPending}>
                {rows.map((account) => (
                  <TableRow
                    key={account.id}
                    data-account-id={account.id}
                    data-state={
                      selected?.id === account.id ? "selected" : undefined
                    }
                    className="cursor-pointer"
                    onClick={(event) => {
                      if (busy) return;
                      opener.current = event.currentTarget.querySelector(
                        "button[data-account-opener]",
                      );
                      select(account);
                    }}
                  >
                    <TableCell className="pl-0">
                      <button
                        type="button"
                        data-account-opener
                        aria-haspopup="dialog"
                        className="block max-w-full truncate rounded-sm text-left font-medium focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {account.name}
                      </button>
                      <IdCell id={account.id} />
                    </TableCell>
                    <TableCell>
                      <span className="block truncate">{account.name}</span>
                      {account.archived_at && (
                        <small className="text-muted-foreground">
                          Archived <Time iso={account.archived_at} />
                        </small>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {account.organization_role}
                    </TableCell>
                    <TableCell data-created-at={account.created_at}>
                      <Day iso={account.created_at} />
                    </TableCell>
                    {archived ? (
                      <TableCell data-archived-at={account.archived_at}>
                        <Day iso={account.archived_at} />
                      </TableCell>
                    ) : (
                      <TableCell
                        className="text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <AccountActions
                          account={account}
                          disabled={busy}
                          onAction={(action, trigger) => {
                            opener.current = trigger;
                            if (action === "edit") {
                              select(account, "load-edit");
                            } else {
                              setSelection(null);
                              setModal({ kind: action, account });
                            }
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={header.length}
                      className="h-[316px] text-center whitespace-normal text-muted-foreground"
                    >
                      {directory.isPending ? (
                        <span role="status">Loading service accounts…</span>
                      ) : (
                        <div className="flex translate-y-2.5 flex-col items-center gap-2.5">
                          <Shield
                            aria-hidden
                            className="mb-2 size-14 stroke-1"
                          />
                          <p>
                            {needle
                              ? `No matching ${archived ? "archived " : ""}service accounts`
                              : archived
                                ? "No archived service accounts"
                                : "No service accounts yet"}
                          </p>
                          {needle ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7"
                              onClick={() => {
                                changeQuery("");
                                search.current?.focus();
                              }}
                            >
                              <RotateCcw />
                              Reset search
                            </Button>
                          ) : (
                            !archived && (
                              <p className="text-[13px]">
                                Create one to give a workload its own identity.
                              </p>
                            )
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {selection?.mode === "load-edit" && (
        <LoadServiceAccountForEdit
          key={selection.account.id}
          account={selection.account}
          returnFocus={opener}
          onClose={() => setSelection(null)}
          onLoaded={(current) =>
            select(current, current.archived_at ? "view" : "edit")
          }
        />
      )}
      {selected && selection?.mode === "edit" && (
        <ServiceAccountEditPanel
          key={selected.id}
          account={selected}
          returnFocus={opener}
          onClose={() => select(selected)}
          onSaved={(account) => select(account)}
        />
      )}
      {selected && selection?.mode === "view" && (
        <ServiceAccountPanel
          account={selected}
          previous={rows[index - 1]}
          next={index < 0 ? undefined : rows[index + 1]}
          listHref={listHref}
          onEdit={(account) => select(account, "edit")}
          onClose={() => setSelection(null)}
          onSelect={(account) => {
            opener.current = document.querySelector<HTMLButtonElement>(
              `tr[data-account-id="${CSS.escape(account.id)}"] button[data-account-opener]`,
            );
            select(account);
          }}
          returnFocus={opener}
          fallbackFocus={search}
        />
      )}
      {modal?.kind === "create" && (
        <CreateServiceAccountDialog
          returnFocus={create}
          onClose={() => setModal(null)}
          onCreated={created}
        />
      )}
      {modal?.kind === "archive" && (
        <ArchiveServiceAccountDialog
          account={modal.account}
          returnFocus={opener}
          onClose={() => setModal(null)}
          onArchived={() => {
            setModal(null);
            setSelection(null);
            search.current?.focus();
          }}
        />
      )}
      {modal?.kind === "key" && (
        <ServiceAccountKeyIssuer
          account={modal.account}
          returnFocus={opener}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
