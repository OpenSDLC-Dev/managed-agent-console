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
import { ResourceActions } from "@/components/console/resource-actions";
import {
  Day,
  EmptyState,
  ErrorState,
  StatusBadge,
  UnavailableSurface,
} from "@/components/console/bits";
import { useArchiveDream, useDreams } from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Dream, DreamStatus } from "@/lib/platform/types";

function memoryStoreInput(dream: Dream) {
  return dream.inputs.find((input) => input.type === "memory_store");
}

function sessionInput(dream: Dream) {
  return dream.inputs.find((input) => input.type === "sessions");
}

function RowActions({ dream }: { dream: Dream }) {
  const archive = useArchiveDream(dream.id);
  const terminal = dream.status !== "pending" && dream.status !== "running";
  return (
    <ResourceActions
      resource="dream"
      archived={!!dream.archived_at}
      onArchive={
        terminal && !dream.archived_at ? () => archive.mutate() : undefined
      }
      archivePending={archive.isPending}
    />
  );
}

const COLUMNS: Column<Dream>[] = [
  { key: "id", header: "ID", cell: (row) => <IdCell id={row.id} /> },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <span data-status={row.archived_at ? "archived" : row.status}>
        <StatusBadge status={row.archived_at ? "archived" : row.status} />
      </span>
    ),
  },
  {
    key: "store",
    header: "Input store",
    className: "w-full",
    cell: (row) => (
      <span className="font-mono text-[13px]">
        {memoryStoreInput(row)?.memory_store_id ?? "—"}
      </span>
    ),
  },
  {
    key: "sessions",
    header: "Sessions",
    cell: (row) => {
      const count = sessionInput(row)?.session_ids.length ?? 0;
      return <span data-session-count={count}>{count.toLocaleString()}</span>;
    },
  },
  {
    key: "output",
    header: "Output",
    cell: (row) =>
      row.output_behavior.type === "create_new" ? "New store" : "Update input",
  },
  {
    key: "created",
    header: "Created",
    cell: (row) => <Day iso={row.created_at} />,
  },
  {
    key: "actions",
    header: "Actions",
    cell: (row) => <RowActions dream={row} />,
  },
];

type View = "live" | "archived" | DreamStatus;

export default function DreamsPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("live");
  const pager = useCursorPage(view);
  const query = useDreams({
    page: pager.page,
    ...(view === "archived" ? { include_archived: true } : {}),
    ...(view !== "live" && view !== "archived" ? { statuses: [view] } : {}),
  });

  if (isUnimplemented(query.error))
    return <UnavailableSurface surface="dreams" />;

  return (
    <div>
      <PageHeader
        title="Dreams"
        subtitle={SURFACES.dreams.blurb}
        actions={
          <Button
            size="sm"
            className="h-8"
            onClick={() => router.push("/dreams/new")}
          >
            <Plus className="size-4" /> Create dream
          </Button>
        }
      />
      <div className="pb-4">
        <Select value={view} onValueChange={(value) => setView(value as View)}>
          <SelectTrigger aria-label="Dream status" className="h-8 w-44">
            <SelectValue>
              {view === "live"
                ? "All live"
                : view === "archived"
                  ? "Include archived"
                  : view[0].toUpperCase() + view.slice(1)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">All live</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="archived">Include archived</SelectItem>
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
            rowKey={(row) => row.id}
            loading={query.isPending}
            onRowClick={(row) => router.push(`/dreams/${row.id}`)}
            empty={
              <EmptyState
                title="No dreams yet"
                hint="Create a dream to consolidate session context into memory."
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
