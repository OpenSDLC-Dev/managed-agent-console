"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
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
    key: "description",
    header: "Description",
    cell: (store) => store.description || "—",
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
    key: "updated",
    header: "Updated",
    cell: (store) => <Day iso={store.updated_at} />,
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
  const pager = useCursorPage(view);
  const query = useMemoryStores({
    page: pager.page,
    include_archived: view === "all" || undefined,
  });
  if (isUnimplemented(query.error))
    return <UnavailableSurface surface="memory-stores" />;

  return (
    <div>
      <PageHeader
        title="Memory stores"
        subtitle={SURFACES["memory-stores"].blurb}
        actions={
          <Button
            size="sm"
            className="h-8"
            onClick={() => router.push("/memory-stores/new")}
          >
            <Plus className="size-4" /> Create memory store
          </Button>
        }
      />
      <div className="pb-4">
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
