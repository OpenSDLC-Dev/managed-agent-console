"use client";

import { useState } from "react";
import { ExactResourceLookup } from "@/components/console/exact-resource-lookup";
import {
  CreatedFilter,
  createdGte,
  type CreatedPresetKey,
} from "@/components/console/created-filter";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [view, setView] = useState<"live" | "all">("live");
  const [created, setCreated] = useState<{
    key: CreatedPresetKey;
    gte?: string;
  }>({ key: "all" });
  const pager = useCursorPage(view + "|" + created.key);
  const query = useMemoryStores({
    page: pager.page,
    "created_at[gte]": created.gte,
    include_archived: view === "all" || undefined,
  });
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
        <ExactResourceLookup resource="memory store" path="/memory-stores" />
        <CreatedFilter
          value={created.key}
          onChange={(key) => setCreated({ key, gte: createdGte(key) })}
        />
        <Select
          value={view}
          onValueChange={(value) => setView(value as typeof view)}
        >
          <SelectTrigger aria-label="Memory store status" className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="all">Include archived</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={query.data?.data ?? []}
            rowKey={(store) => store.id}
            loading={query.isPending}
            onRowClick={(store) => router.push(`/memory-stores/${store.id}`)}
            empty={
              <EmptyState
                title="No memory stores yet"
                hint="Create a store for durable files shared across sessions."
              />
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
