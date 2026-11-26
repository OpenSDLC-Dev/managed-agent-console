"use client";

import { use } from "react";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import { VaultEditor } from "@/components/console/vault-editor";
import { PageHeader } from "@/components/shell/page-header";
import { useVault } from "@/lib/platform/queries";

export default function EditVaultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = useVault(id);

  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  if (query.data.archived_at)
    return <ErrorState error={new Error("Archived vaults are read only.")} />;

  return (
    <div>
      <PageHeader title={`Edit ${query.data.display_name}`} />
      <VaultEditor key={query.data.updated_at} vault={query.data} />
    </div>
  );
}
