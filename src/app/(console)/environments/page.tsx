"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  ArchivedBadge,
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import { StatusFilter } from "@/components/console/status-filter";
import { useEnvironments } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Environment } from "@/lib/platform/types";

const COLUMNS: Column<Environment>[] = [
  { key: "id", header: "ID", cell: (e) => <IdCode id={e.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (e) => (
      <span className="flex items-center gap-2">
        {e.name} <ArchivedBadge archivedAt={e.archived_at} />
      </span>
    ),
  },
  { key: "type", header: "Type", cell: (e) => e.config.type },
  {
    key: "updated",
    header: "Updated at",
    cell: (e) => <Time iso={e.updated_at} />,
  },
];

export default function EnvironmentsPage() {
  const router = useRouter();
  const [includeArchived, setIncludeArchived] = useState(false);
  const pager = useCursorPage(String(includeArchived));
  const { data, error, isPending } = useEnvironments({
    page: pager.page,
    include_archived: includeArchived || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Environments"
        subtitle="Configuration templates for session sandboxes."
      />
      <div className="flex items-center gap-2 pb-4">
        <StatusFilter
          includeArchived={includeArchived}
          onChange={setIncludeArchived}
        />
      </div>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={data?.data ?? []}
            rowKey={(e) => e.id}
            loading={isPending}
            onRowClick={(e) => router.push(`/environments/${e.id}`)}
            empty={
              <EmptyState
                title="No environments yet"
                hint="Environments are created through the API until slice 4 lands."
              />
            }
          />
          <Pager
            hasPrev={pager.hasPrev}
            hasNext={!!data?.next_page}
            onPrev={pager.goPrev}
            onNext={() => data?.next_page && pager.goNext(data.next_page)}
          />
        </>
      )}
    </div>
  );
}
