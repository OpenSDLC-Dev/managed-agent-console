"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  Day,
  EmptyState,
  ErrorState,
  HostingType,
  ResourceStatus,
  UnavailableSurface,
} from "@/components/console/bits";
import { IdCell } from "@/components/console/copy-id";
import { ResourceActions } from "@/components/console/resource-actions";
import { CreateEnvironmentButton } from "@/components/console/create-environment-dialog";
import { StatusFilter } from "@/components/console/status-filter";
import {
  useArchiveEnvironment,
  useDeleteEnvironment,
  useEnvironments,
} from "@/lib/platform/queries";
import { isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Environment } from "@/lib/platform/types";

function EnvironmentRowActions({ environment }: { environment: Environment }) {
  const archive = useArchiveEnvironment(environment.id);
  const remove = useDeleteEnvironment(environment.id);
  return (
    <ResourceActions
      resource="environment"
      archived={!!environment.archived_at}
      archiveWarning="Sessions can no longer be created in it."
      deleteDescription="Deleting is permanent and cannot be undone. The platform refuses if any session still references this environment."
      onArchive={environment.archived_at ? undefined : () => archive.mutate()}
      onDelete={() => remove.mutate()}
      archivePending={archive.isPending}
      deletePending={remove.isPending}
    />
  );
}

const COLUMNS: Column<Environment>[] = [
  { key: "id", header: "ID", cell: (e) => <IdCell id={e.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (e) => e.name,
  },
  {
    key: "status",
    header: "Status",
    cell: (e) => <ResourceStatus archivedAt={e.archived_at} />,
  },
  {
    key: "type",
    header: "Type",
    cell: (e) => <HostingType type={e.config.type} />,
  },
  {
    key: "updated",
    header: "Updated at",
    cell: (e) => <Day iso={e.updated_at} />,
  },
  {
    key: "actions",
    header: "Actions",
    cell: (e) => <EnvironmentRowActions environment={e} />,
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

  if (isUnimplemented(error))
    return <UnavailableSurface surface="environments" />;

  return (
    <div>
      <PageHeader
        title="Environments"
        subtitle="Configuration templates for session sandboxes."
        actions={<CreateEnvironmentButton />}
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
                hint="Create your first environment to get started."
                action={<CreateEnvironmentButton variant="outline" />}
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
