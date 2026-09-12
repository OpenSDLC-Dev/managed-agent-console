"use client";

import { Button } from "@/components/ui/button";

import { Suspense, useMemo, useRef } from "react";
import { MemoryStoreInspector } from "@/components/console/memory-store-inspector";
import { ExactResourceLookup } from "@/components/console/exact-resource-lookup";
import { CreatedFilter } from "@/components/console/created-filter";
import { useListFilters } from "@/lib/use-list-filters";
import {
  decodeCreatedFilter,
  encodeCreatedFilter,
} from "@/components/console/created-filter-state";
import { PageHeader } from "@/components/shell/page-header";
import { CreateMemoryStoreButton } from "@/components/console/create-memory-store-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import { IdCell } from "@/components/console/copy-id";
import {
  Day,
  EmptyState,
  ErrorState,
  UnavailableSurface,
} from "@/components/console/bits";
import { MemoryStoreActions } from "@/components/console/memory-store-actions";
import { useMemoryStores } from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { MemoryStore } from "@/lib/platform/types";

const COLUMNS: Column<MemoryStore>[] = [
  { key: "id", header: "ID", cell: (store) => <IdCell id={store.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (store) => store.name,
  },
  {
    key: "status",
    header: "Status",
    cell: (store) => (
      <span data-status={store.archived_at ? "archived" : "live"}>
        {store.archived_at ? "Archived" : "Live"}
      </span>
    ),
  },
  {
    key: "created",
    header: "Created",
    cell: (store) => <Day iso={store.created_at} />,
  },
  {
    key: "actions",
    header: "Actions",
    cell: (store) => <MemoryStoreActions store={store} />,
  },
];

export default function MemoryStoresPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading filters…</p>}
    >
      <MemoryStoresList />
    </Suspense>
  );
}

function MemoryStoresList() {
  const filters = useListFilters();
  const inspected = filters.params.get("store");
  const lookup = useRef<HTMLInputElement>(null);
  const deleted = useRef(false);
  const inspect = (id: string) => {
    deleted.current = false;
    filters.update({ store: id });
  };
  const view = filters.params.get("status") === "all" ? "all" : "live";
  const createdKey = filters.params.get("created");
  const created = useMemo(() => decodeCreatedFilter(createdKey), [createdKey]);
  const pager = useCursorPage(
    `${view}|${created.key}|${created.gte}|${created.lte}`,
  );
  const query = useMemoryStores({
    page: pager.page,
    "created_at[gte]": created.gte,
    "created_at[lte]": created.lte,
    include_archived: view === "all" || undefined,
  });
  const rows = query.data?.data ?? [];
  const index = rows.findIndex((row) => row.id === inspected);
  const filtered = view !== "live" || created.key !== "all";
  const resetFilters = () => filters.update({ status: null, created: null });

  if (isUnimplemented(query.error))
    return <UnavailableSurface surface="memory-stores" />;

  return (
    <div>
      <PageHeader
        title="Memory stores"
        subtitle={SURFACES["memory-stores"].blurb}
        actions={<CreateMemoryStoreButton />}
      />
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <ExactResourceLookup
          resource="memory store"
          path="/memory-stores"
          onOpen={inspect}
          inputRef={lookup}
        />
        <CreatedFilter
          value={created.key}
          range={created.range}
          onChange={(key, range) =>
            filters.update({ created: encodeCreatedFilter(key, range) })
          }
        />
        <Select
          value={view}
          onValueChange={(value) =>
            filters.update({ status: value === "all" ? "all" : null })
          }
        >
          <SelectTrigger aria-label="Memory store status" className="h-8 w-44">
            <SelectValue>
              {view === "live" ? "Live" : "Include archived"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="all">Include archived</SelectItem>
          </SelectContent>
        </Select>
        {filtered && (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>
      {inspected && (
        <MemoryStoreInspector
          id={inspected}
          previous={index > 0 ? rows[index - 1]?.id : undefined}
          next={index >= 0 ? rows[index + 1]?.id : undefined}
          onSelect={inspect}
          onClose={() => filters.update({ store: null })}
          onDeleted={() => {
            deleted.current = true;
            filters.update({ store: null });
          }}
          fallbackFocus={lookup}
          restoreToFallback={deleted}
        />
      )}
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={query.data?.data ?? []}
            rowKey={(store) => store.id}
            loading={query.isPending}
            activeRowKey={inspected ?? undefined}
            onRowClick={(store) => inspect(store.id)}
            empty={
              filtered ? (
                <EmptyState
                  title="No matching memory stores"
                  hint="No memory stores match the current filters."
                  action={
                    <Button variant="outline" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No memory stores yet"
                  hint="Create a store for durable files shared across sessions."
                />
              )
            }
          />
          <Pager
            hasPrev={pager.hasPrev}
            hasNext={!!query.data?.next_page}
            onPrev={pager.goPrev}
            onNext={() =>
              query.data?.next_page && pager.goNext(query.data.next_page)
            }
          />
        </>
      )}
    </div>
  );
}
