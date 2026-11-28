"use client";

import { ApiKeyStatus } from "./api-key-status";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useUpdateApiKey } from "@/lib/platform/queries";
import type { ApiKeyListItem } from "@/lib/platform/types";
import { Day, EmptyState, ErrorState } from "./bits";
import { ApiKeyActions, ApiKeyDetails } from "./api-key-detail";
import {
  apiKeyAccountLabel,
  apiKeyCreatorLabel,
  apiKeyDisplayName,
  apiKeyOwnerId,
  apiKeyStatusLabel,
} from "./api-key-labels";

const clearFilters = { query: "", creator: "", owner: "", status: "" };
const headings = [
  { field: "name", label: "Key" },
  { label: "Linked account" },
  { field: "expires_at", label: "Expires" },
  { field: "created_at", label: "Created" },
  { label: "Actions" },
] as const;
type SortField = "name" | "created_at" | "expires_at";
type Sort = { field: SortField; direction: "ascending" | "descending" };
type Option = { value: string; label: string };

function KeyFilter({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      role="group"
      aria-label={`${label} filter`}
      className="inline-flex max-w-full items-center"
    >
      <Select value={value || null} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger
          ref={trigger}
          aria-label={label}
          data-value={value}
          size="sm"
          className="max-w-full border-0 bg-muted px-2 hover:bg-accent dark:bg-muted"
        >
          <span className="text-muted-foreground">{label}</span>
          <SelectValue className="truncate">
            {value
              ? (options.find((item) => item.value === value)?.label ?? value)
              : all}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          className="w-auto max-w-[90vw]"
        >
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <button
          type="button"
          aria-label="Clear selection"
          className="relative ms-[9px] me-[3px] flex size-[22px] shrink-0 items-center justify-center rounded-md text-muted-foreground after:absolute after:-inset-px hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => {
            onChange("");
            trigger.current?.focus();
          }}
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function compareKeys(a: ApiKeyListItem, b: ApiKeyListItem, sort: Sort) {
  const left = sort.field === "name" ? apiKeyDisplayName(a) : a[sort.field];
  const right = sort.field === "name" ? apiKeyDisplayName(b) : b[sort.field];
  // Never has no date; keep it after all dated expiries in either direction.
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  const order =
    sort.field === "name"
      ? left.localeCompare(right)
      : Date.parse(left) - Date.parse(right);
  return sort.direction === "ascending" ? order : -order;
}

function identityOptions(entries: [string, string][]): Option[] {
  return Array.from(new Map(entries), ([value, label]) => ({
    value,
    label,
  })).sort((a, b) => a.label.localeCompare(b.label));
}

export function ApiKeysTable({
  keys,
  loading,
  error,
  action,
  canViewCost = false,
  linkedKeyId = null,
  onLinkedKeyChange,
}: {
  keys: ApiKeyListItem[];
  loading: boolean;
  error: unknown;
  action?: ReactNode;
  canViewCost?: boolean;
  linkedKeyId?: string | null;
  onLinkedKeyChange?: (id: string | null) => void;
}) {
  const session = useContext(ConsoleSessionContext)?.data;
  const update = useUpdateApiKey();
  const [filters, setFilters] = useState(clearFilters);
  const [sort, setSort] = useState<Sort>();
  const [selection, setSelection] = useState<{
    id: string | null;
    removed?: boolean;
  }>({ id: null });
  const opener = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  // React detaches the ref before removing the row. At that point the action
  // that opened its menu can still own focus, even after the dialog closes.
  const restoreRowFocus = useCallback((row: HTMLTableRowElement | null) => {
    if (!row) return;
    return () => {
      if (row.contains(document.activeElement)) search.current?.focus();
    };
  }, []);
  const listedKeys = keys.filter((key) => key.status !== "archived");
  const query = filters.query.trim().toLowerCase();
  const rows = listedKeys.filter(
    (key) =>
      (!query ||
        [key.name, key.id, key.partial_key_hint].some((value) =>
          value.toLowerCase().includes(query),
        )) &&
      (!filters.creator ||
        (key.created_by?.id ?? "control-plane") === filters.creator) &&
      (!filters.owner ||
        (key.principal?.type ?? "unowned") === filters.owner) &&
      (!filters.status || key.status === filters.status),
  );
  if (sort) rows.sort((left, right) => compareKeys(left, right, sort));
  const filterSelected = Boolean(
    filters.owner || filters.creator || filters.status,
  );
  const filtered = Boolean(filters.query || filterSelected);
  const selectedId = linkedKeyId ?? selection.id;
  const selected = rows.find((key) => key.id === selectedId);
  const missingSelection = !selected && !loading && !error;
  if (!linkedKeyId && selection.id !== null && missingSelection)
    setSelection({ id: null, removed: true });
  useEffect(() => {
    if (linkedKeyId && missingSelection) onLinkedKeyChange?.(null);
  }, [linkedKeyId, missingSelection, onLinkedKeyChange]);
  // A nonmodal inspector leaves outside focus alone. When its selected row
  // disappears too, return the keyboard to search if the document lost focus.
  useEffect(() => {
    if (
      selection.removed &&
      (!document.activeElement?.isConnected ||
        document.activeElement === document.body)
    ) {
      search.current?.focus();
    }
  }, [selection.removed]);
  function selectKey(id: string | null) {
    if (linkedKeyId) {
      setSelection({ id: null });
      onLinkedKeyChange?.(id);
    } else {
      setSelection({ id });
    }
  }
  const resetFilters = () => {
    setFilters(clearFilters);
    search.current?.focus();
  };
  const setFilter = (field: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));
  const statuses = new Set([
    "active",
    "inactive",
    "expired",
    ...listedKeys.map((key) => key.status),
  ]);

  return (
    <div className="sm:-mx-2">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-[24px] font-medium leading-7">
              API keys
            </h1>
            {!loading && !error && (
              <span
                data-visible-count={rows.length}
                aria-live="polite"
                aria-atomic="true"
                className="rounded-full bg-muted px-1.5 text-xs leading-5 tabular-nums text-muted-foreground"
              >
                {rows.length}
                <span className="sr-only"> matching API keys</span>
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            A key acts as its linked user or service account. Deactivating that
            account revokes access.
          </p>
        </div>
        {action}
      </header>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <div
            role="group"
            aria-label="Filter API keys"
            className="mt-6 flex flex-wrap items-center gap-2"
          >
            <div className="relative w-full sm:w-80">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={search}
                type="search"
                aria-label="Search keys"
                placeholder="Search keys"
                value={filters.query}
                onChange={(event) => setFilter("query", event.target.value)}
                className="h-7 border-transparent bg-muted pl-9 shadow-none focus-visible:border-ring dark:bg-muted"
              />
            </div>
            <KeyFilter
              label="Created by"
              all="Anyone"
              value={filters.creator}
              onChange={(value) => setFilter("creator", value)}
              options={identityOptions(
                listedKeys.map((key) => [
                  key.created_by?.id ?? "control-plane",
                  apiKeyCreatorLabel(key, session),
                ]),
              )}
            />
            <KeyFilter
              label="Linked account"
              all="All"
              value={filters.owner}
              onChange={(value) => setFilter("owner", value)}
              options={[
                { value: "user_actor", label: "Person" },
                { value: "service_account_actor", label: "Service account" },
                { value: "unowned", label: "Not linked" },
              ]}
            />
            <KeyFilter
              label="Status"
              all="All"
              value={filters.status}
              onChange={(value) => setFilter("status", value)}
              options={Array.from(statuses, (value) => ({
                value,
                label: apiKeyStatusLabel(value),
              }))}
            />
            {filtered && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={resetFilters}
              >
                Reset
              </Button>
            )}
          </div>
          <div className="mt-8">
            <Table className="min-w-[620px] table-fixed" aria-label="API keys">
              <colgroup>
                <col className="w-[32%] lg:w-[272px]" />
                <col className="w-[25%]" />
                <col className="w-[18%]" />
                <col />
                <col className="w-12" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {headings.map((heading) => {
                    const field =
                      "field" in heading ? heading.field : undefined;
                    const direction =
                      sort && field === sort.field ? sort.direction : undefined;
                    const ascendingNext = direction
                      ? direction === "descending"
                      : field === "name";
                    return (
                      <TableHead
                        key={heading.label}
                        scope="col"
                        aria-sort={direction}
                        data-default-ascending={
                          !direction && field === "name" ? true : undefined
                        }
                        className="group h-9 px-2 text-[13px] font-normal text-muted-foreground first:pl-0"
                      >
                        {field ? (
                          <button
                            type="button"
                            className="flex h-8 w-full items-center gap-1 rounded-sm outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                            onClick={() =>
                              setSort({
                                field,
                                direction: ascendingNext
                                  ? "ascending"
                                  : "descending",
                              })
                            }
                          >
                            {heading.label}
                            <ChevronDown
                              aria-hidden="true"
                              className="size-3 opacity-0 group-hover:opacity-65 group-focus-within:opacity-65 group-aria-[sort]:opacity-100 group-aria-[sort=ascending]:rotate-180 group-data-default-ascending:rotate-180"
                            />
                          </button>
                        ) : heading.label === "Actions" ? (
                          <span className="sr-only">Actions</span>
                        ) : (
                          heading.label
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody aria-busy={loading || undefined}>
                {loading &&
                  !listedKeys.length &&
                  [0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      {headings.map(({ label }) => (
                        <TableCell key={label}>
                          <Skeleton className="h-5 w-3/4" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {rows.map((key) => (
                  <TableRow
                    key={key.id}
                    ref={restoreRowFocus}
                    data-state={key.id === selectedId ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={(event) => {
                      opener.current =
                        event.currentTarget.querySelector<HTMLButtonElement>(
                          "button[data-key-id]",
                        );
                      selectKey(key.id);
                    }}
                  >
                    <TableCell className="pl-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          data-key-id={key.id}
                          aria-haspopup="dialog"
                          title={apiKeyDisplayName(key)}
                          className="truncate rounded-sm text-left font-medium outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {apiKeyDisplayName(key)}
                        </button>
                        <ApiKeyStatus status={key.status} hideActive />
                      </div>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {key.partial_key_hint}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div
                        data-owner-id={apiKeyOwnerId(key) ?? ""}
                        data-owner-type={key.principal?.type ?? ""}
                      >
                        <p className="truncate" title={apiKeyOwnerId(key)}>
                          {apiKeyAccountLabel(key, session)}
                        </p>
                        {key.principal && (
                          <p className="text-[13px] text-muted-foreground">
                            {key.principal.type === "user_actor"
                              ? "User"
                              : "Service account"}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-expires-at={key.expires_at ?? ""}>
                      {key.expires_at ? <Day iso={key.expires_at} /> : "Never"}
                    </TableCell>
                    <TableCell>
                      <div
                        data-created-by={key.created_by?.id ?? ""}
                        data-created-by-type={key.created_by?.type ?? ""}
                      >
                        <p className="truncate" title={key.created_by?.id}>
                          {apiKeyCreatorLabel(key, session)}
                        </p>
                        <p
                          className="text-[13px] text-muted-foreground"
                          data-created-at={key.created_at}
                        >
                          <Day iso={key.created_at} />
                        </p>
                      </div>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ApiKeyActions
                        apiKey={key}
                        update={update}
                        canViewCost={canViewCost}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!loading &&
              !rows.length &&
              (filtered ? (
                <EmptyState
                  title="No matching API keys"
                  hint={
                    filterSelected
                      ? "No keys match the current filters."
                      : "No keys match the current search."
                  }
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetFilters}
                    >
                      {filterSelected ? "Reset filters" : "Reset search"}
                    </Button>
                  }
                />
              ) : (
                <EmptyState title="No API keys yet." />
              ))}
          </div>
          <ApiKeyDetails
            apiKey={selected}
            rows={rows}
            onSelect={selectKey}
            onClose={() => selectKey(null)}
            finalFocus={opener}
            fallbackFocus={search}
            update={update}
            canViewCost={canViewCost}
          />
        </>
      )}
    </div>
  );
}
