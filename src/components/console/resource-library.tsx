"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
  type RefObject,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toolbar } from "@base-ui/react/toolbar";
import { FileStack, MoreHorizontal, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "./data-table";
import { ErrorState, UnavailableSurface } from "./bits";
import { Pager } from "./pager";
import { PlatformError, type Page } from "@/lib/platform/http";
import { isPermissionDenied } from "@/lib/platform/denied";
import { isUnimplemented } from "@/lib/platform/surfaces";
import { cn } from "@/lib/utils";
import type { useCursorPage } from "@/lib/platform/use-cursor-page";
import {
  InvalidLibraryID,
  useDeleteLibraryResources,
} from "@/lib/platform/queries";

export function LibraryRowMenu({
  name,
  onUpdate,
  onDelete,
  disabled,
}: {
  name: string;
  onUpdate?: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <span onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={"Actions for " + name}
              disabled={disabled}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onUpdate && (
            <DropdownMenuItem onClick={onUpdate}>Update</DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

type RecordWithID = { id: string };
type InspectorNavigation = {
  id: string;
  previous?: string;
  next?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  fallbackFocus: RefObject<HTMLInputElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
};

// Files and Skills share the same page-scoped selection, exact-ID lookup and
// confirm/retry flow. The list and detail requests remain separate platform routes.
export function ResourceLibrary<T extends RecordWithID>({
  kind,
  title,
  description,
  page,
  list,
  getRecord,
  name,
  columns,
  action,
  Inspector,
  canDelete,
  UploadButton,
}: {
  kind: "file" | "skill";
  title: string;
  description: string;
  page: ReturnType<typeof useCursorPage>;
  list: {
    data?: Page<T>;
    error: unknown;
    isPending: boolean;
    isPlaceholderData: boolean;
  };
  getRecord: (id: string) => Promise<T>;
  name: (row: T) => string;
  columns: Column<T>[];
  action: (row: T, remove: () => void) => ReactNode;
  Inspector: ComponentType<InspectorNavigation>;
  canDelete?: (row: T) => boolean;
  UploadButton: ComponentType<{
    onCreated: () => void;
    onDismissCreateRequest?: () => void;
  }>;
}) {
  const path = "/" + kind + "s";
  const params = useSearchParams();
  const router = useRouter();
  const active = params.get(kind);
  const input = useRef<HTMLInputElement>(null);
  const lastCheckbox = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const [id, setID] = useState("");
  const trimmed = draft.trim();
  useEffect(() => {
    const timer = setTimeout(() => setID(trimmed), 250);
    return () => clearTimeout(timer);
  }, [trimmed]);
  const options = (key: string) => ({
    queryKey: [kind, key],
    queryFn: () => getRecord(key),
    retry: false as const,
  });
  const matched = useQuery({ ...options(id), enabled: !!id });
  const rows = trimmed
    ? id === trimmed && matched.data && !matched.error
      ? [matched.data]
      : []
    : (list.data?.data ?? []);
  const loading = trimmed
    ? id !== trimmed || matched.isPending
    : list.isPending;
  const error = trimmed ? id === trimmed && matched.error : list.error;
  const missing =
    !!trimmed &&
    (error instanceof InvalidLibraryID ||
      (error instanceof PlatformError &&
        error.status === 404 &&
        error.errorType === "not_found_error"));
  const scope = [page.page ?? "", trimmed].join("|");
  const [selection, setSelection] = useState({ scope, ids: [] as string[] });
  if (selection.scope !== scope) setSelection({ scope, ids: [] });
  const selected = rows.filter((row) => selection.ids.includes(row.id));
  function select(ids: string[], checkbox: HTMLInputElement) {
    lastCheckbox.current = checkbox;
    setSelection({ scope, ids });
  }
  const [deletion, setDeletion] = useState<{
    rows: T[];
    bulk: boolean;
    error?: string;
  } | null>(null);
  const remove = useDeleteLibraryResources(kind);
  const cancel = useRef<HTMLButtonElement>(null);
  const searchIntent = useRef(0);
  const locationQuery = params.toString();
  useEffect(
    () => () => {
      searchIntent.current++;
    },
    [locationQuery],
  );

  function open(id?: string) {
    searchIntent.current++;
    const next = new URLSearchParams(params.toString());
    if (id) next.set(kind, id);
    else next.delete(kind);
    router.push(path + (next.size ? "?" + next.toString() : ""), {
      scroll: false,
    });
  }
  function clear() {
    searchIntent.current++;
    setDraft("");
    setID("");
    input.current?.focus();
  }
  async function submitLookup() {
    if (!trimmed) return;
    setID(trimmed);
    if (kind === "skill") {
      const intent = ++searchIntent.current;
      const sourceURL = window.location.href;
      try {
        const record = await client.fetchQuery(options(trimmed));
        if (
          intent === searchIntent.current &&
          window.location.href === sourceURL &&
          input.current?.value.trim() === trimmed
        ) {
          trigger.current = input.current;
          open(record.id);
        }
      } catch {
        /* The search result displays the platform error. */
      }
    }
  }
  async function confirm() {
    if (!deletion) return;
    const { succeeded, failed } = await remove.mutateAsync(
      deletion.rows.map((row) => row.id),
    );
    if (succeeded.length) {
      toast.success(
        succeeded.length +
          " " +
          kind +
          (succeeded.length === 1 ? "" : "s") +
          " deleted",
      );
      setSelection((current) => ({
        ...current,
        ids: current.ids.filter((id) => !succeeded.includes(id)),
      }));
      if (active && succeeded.includes(active)) open();
      if (succeeded.includes(trimmed)) clear();
      if (
        !trimmed &&
        page.hasPrev &&
        rows.every((row) => succeeded.includes(row.id))
      ) {
        page.goPrev();
      }
    }
    if (failed.length) {
      setDeletion({
        ...deletion,
        rows: deletion.rows.filter((row) =>
          failed.some((f) => f.id === row.id),
        ),
        error: failed
          .map(
            (f) =>
              f.id +
              ": " +
              (f.error instanceof Error ? f.error.message : "Delete failed"),
          )
          .join("\n"),
      });
    } else setDeletion(null);
  }

  if (isUnimplemented(list.error))
    return (
      <UnavailableSurface surface={kind === "file" ? "files" : "skills"} />
    );
  if (isPermissionDenied(list.error)) return <ErrorState error={list.error} />;
  const index = rows.findIndex((row) => row.id === active);
  const selectColumn: Column<T> = {
    key: "select",
    className: "w-8",
    header: (
      <input
        type="checkbox"
        className="accent-foreground"
        aria-label="Select all rows"
        checked={!!rows.length && selected.length === rows.length}
        disabled={!rows.length || list.isPlaceholderData}
        ref={(node) => {
          if (node)
            node.indeterminate =
              selected.length > 0 && selected.length < rows.length;
        }}
        onChange={(event) =>
          select(
            event.target.checked ? rows.map((row) => row.id) : [],
            event.currentTarget,
          )
        }
      />
    ),
    cell: (row) => (
      <input
        type="checkbox"
        className="accent-foreground"
        aria-label={"Select " + name(row)}
        checked={selection.ids.includes(row.id)}
        disabled={list.isPlaceholderData}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          select(
            event.target.checked
              ? [...selection.ids, row.id]
              : selection.ids.filter((id) => id !== row.id),
            event.currentTarget,
          )
        }
      />
    ),
  };
  const tableColumns = [
    ...(trimmed ? [] : [selectColumn]),
    ...columns,
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-16 text-right",
      cell: (row: T) =>
        action(row, () => setDeletion({ rows: [row], bulk: false })),
    },
  ];
  function created() {
    clear();
    page.first();
    if (active) open();
  }
  function dismissCreateRequest() {
    const current = new URL(window.location.href);
    if (
      current.pathname !== path ||
      current.searchParams.get("create") !== "true"
    )
      return;
    current.searchParams.delete("create");
    router.replace(path + current.search, { scroll: false });
  }
  const count = deletion?.rows.length ?? 0;
  const deleteLabel =
    "Delete " +
    (deletion?.bulk ? count + " " : "") +
    kind +
    (count > 1 ? "s" : "");
  return (
    <div data-resource-library={kind} className="min-w-0 sm:-mx-2">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-medium leading-8">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <UploadButton
          onCreated={created}
          onDismissCreateRequest={
            kind === "skill" &&
            params.get("create") === "true" &&
            list.data &&
            !list.error &&
            !list.isPlaceholderData
              ? dismissCreateRequest
              : undefined
          }
        />
      </header>
      <form
        className="relative mb-3 w-80 max-w-full"
        onSubmit={(event) => {
          event.preventDefault();
          void submitLookup();
        }}
      >
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={input}
          className="h-8 border-0 bg-muted pl-8 pr-8 shadow-none"
          value={draft}
          aria-label={"Find " + kind + " by ID"}
          placeholder={"Find " + kind + " by ID"}
          onChange={(event) => {
            searchIntent.current++;
            setDraft(event.target.value);
          }}
        />
        {draft && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1 right-1"
            aria-label="Clear search"
            onClick={clear}
          >
            <X />
          </Button>
        )}
      </form>
      {error && !missing ? (
        <ErrorState error={error as Error} />
      ) : !loading && !rows.length && !trimmed && page.hasPrev ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {kind}s on this page.
        </p>
      ) : !loading && !rows.length ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-border/60 px-4 text-center">
          <FileStack className="mb-1 size-8 text-muted-foreground" />
          <h2 className="text-sm font-medium">
            {trimmed
              ? (kind === "file" ? "File" : "Skill") + " not found"
              : "No " + kind + "s yet"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {trimmed
              ? "No match for this ID."
              : kind === "file"
                ? "Upload one here or through the API."
                : "Create a skill here or through the API."}
          </p>
          {trimmed ? (
            <Button variant="outline" size="sm" onClick={clear}>
              Clear search
            </Button>
          ) : (
            <UploadButton onCreated={created} />
          )}
        </div>
      ) : (
        <DataTable
          label={title}
          columns={tableColumns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          activeRowKey={active ?? undefined}
          onRowClick={(row) => {
            trigger.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            open(row.id);
          }}
        />
      )}
      {!trimmed && (page.hasPrev || !!list.data?.next_page) && (
        <Pager
          hasPrev={page.hasPrev && !list.isPlaceholderData}
          hasNext={!!list.data?.next_page && !list.isPlaceholderData}
          onPrev={page.goPrev}
          onNext={() => {
            if (list.data?.next_page) page.goNext(list.data.next_page);
          }}
        />
      )}
      {!!selected.length && (
        <div className="flex justify-center pb-(--resource-selection-space)">
          <Toolbar.Root
            aria-label={title + " selection"}
            data-selected-count={selected.length}
            className="fixed bottom-(--resource-selection-bottom) z-41 flex items-center gap-2 rounded-xl bg-popover p-1.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:bg-[#303030] forced-colors:border"
          >
            <span className="px-1.5 font-medium whitespace-nowrap text-muted-foreground">
              {selected.length} selected
            </span>
            <Toolbar.Button
              aria-label="Clear selection"
              title="Clear selection"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "rounded-lg pointer-coarse:size-11",
              )}
              onClick={(event) => {
                setSelection({ scope, ids: [] });
                if (event.detail === 0) {
                  const checkbox = lastCheckbox.current;
                  (checkbox?.isConnected ? checkbox : input.current)?.focus();
                }
              }}
            >
              <X aria-hidden className="size-4" />
            </Toolbar.Button>
            <Toolbar.Separator className="mx-2 my-1 self-stretch border-l" />
            <Toolbar.Button
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1.5 rounded-lg px-2 text-sm font-normal pointer-coarse:min-h-11",
              )}
              focusableWhenDisabled={false}
              disabled={selected.some((row) => canDelete && !canDelete(row))}
              onClick={() => setDeletion({ rows: selected, bulk: true })}
            >
              <Trash2 aria-hidden className="size-4" />
              Delete
            </Toolbar.Button>
          </Toolbar.Root>
        </div>
      )}
      {active && (
        <Inspector
          id={active}
          previous={index > 0 ? rows[index - 1].id : undefined}
          next={index >= 0 ? rows[index + 1]?.id : undefined}
          onSelect={open}
          onClose={() => open()}
          fallbackFocus={input}
          returnFocus={trigger}
        />
      )}
      {deletion && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !remove.isPending) setDeletion(null);
          }}
        >
          <DialogContent
            data-library-dialog=""
            initialFocus={cancel}
            className="sm:max-w-md"
          >
            <DialogTitle>{deleteLabel}?</DialogTitle>
            <DialogDescription>
              {!deletion.bulk && <strong>{name(deletion.rows[0])}. </strong>}
              {kind === "skill"
                ? "All versions will be deleted. Existing code that references the skill will stop working. "
                : "The selected file data will be permanently deleted. "}
              This action cannot be undone.
            </DialogDescription>
            {deletion.error && (
              <p
                role="alert"
                className="whitespace-pre-line break-words text-sm text-destructive"
              >
                {deletion.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                ref={cancel}
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => setDeletion(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => void confirm()}
              >
                {remove.isPending ? "Deleting…" : deleteLabel}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
