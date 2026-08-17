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
  ResourceStatus,
  UnavailableSurface,
} from "@/components/console/bits";
import { IdCell } from "@/components/console/copy-id";
import { ResourceActions } from "@/components/console/resource-actions";
import { StatusFilter } from "@/components/console/status-filter";
import { CreateVaultButton } from "@/components/console/create-vault-button";
import {
  useArchiveVault,
  useDeleteVault,
  useVaults,
} from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Vault } from "@/lib/platform/types";

function VaultRowActions({ vault }: { vault: Vault }) {
  const archive = useArchiveVault(vault.id);
  const remove = useDeleteVault(vault.id);
  return (
    <ResourceActions
      resource="vault"
      archived={!!vault.archived_at}
      archiveWarning="Archiving purges every credential's sealed secret."
      deleteDescription="Deleting is permanent and cascades to every credential in the vault."
      onArchive={vault.archived_at ? undefined : () => archive.mutate()}
      onDelete={() => remove.mutate()}
      archivePending={archive.isPending}
      deletePending={remove.isPending}
    />
  );
}

const COLUMNS: Column<Vault>[] = [
  { key: "id", header: "ID", cell: (v) => <IdCell id={v.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (v) => v.display_name,
  },
  {
    key: "status",
    header: "Status",
    cell: (v) => <ResourceStatus archivedAt={v.archived_at} />,
  },
  {
    key: "created",
    header: "Created",
    cell: (v) => <Day iso={v.created_at} />,
  },
  {
    key: "actions",
    header: "Actions",
    cell: (v) => <VaultRowActions vault={v} />,
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

  if (isUnimplemented(error)) return <UnavailableSurface surface="vaults" />;

  return (
    <div>
      <PageHeader
        title="Credential vaults"
        subtitle={SURFACES.vaults.blurb}
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
