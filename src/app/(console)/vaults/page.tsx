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
  UnavailableSurface,
} from "@/components/console/bits";
import { StatusFilter } from "@/components/console/status-filter";
import { CreateVaultButton } from "@/components/console/create-vault-button";
import { useVaults } from "@/lib/platform/queries";
import { isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Vault } from "@/lib/platform/types";

const COLUMNS: Column<Vault>[] = [
  { key: "id", header: "ID", cell: (v) => <IdCode id={v.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (v) => (
      <span className="flex items-center gap-2">
        {v.display_name} <ArchivedBadge archivedAt={v.archived_at} />
      </span>
    ),
  },
  {
    key: "created",
    header: "Created",
    cell: (v) => <Time iso={v.created_at} />,
  },
];

export default function VaultsPage() {
  const router = useRouter();
  const [includeArchived, setIncludeArchived] = useState(false);
  const pager = useCursorPage(String(includeArchived));
  const { data, error, isPending } = useVaults({
    page: pager.page,
    include_archived: includeArchived || undefined,
  });

  if (isUnimplemented(error))
    return <UnavailableSurface name="Credential vaults" surface="vaults" />;

  return (
    <div>
      <PageHeader
        title="Credential vaults"
        subtitle="Credentials your agents use for MCP servers and other tools."
        actions={<CreateVaultButton />}
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
            rowKey={(v) => v.id}
            loading={isPending}
            onRowClick={(v) => router.push(`/vaults/${v.id}`)}
            empty={
              <EmptyState
                title="No vaults yet"
                hint="Create your first vault to get started."
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
