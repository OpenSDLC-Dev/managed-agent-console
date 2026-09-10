"use client";

import { use } from "react";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import { CredentialEditor } from "@/components/console/credential-editor";
import { PageHeader } from "@/components/shell/page-header";
import { useVaultCredential } from "@/lib/platform/queries";

export default function EditCredentialPage({
  params,
}: {
  params: Promise<{ id: string; credentialId: string }>;
}) {
  const { id, credentialId } = use(params);
  const query = useVaultCredential(id, credentialId);

  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  if (query.data.archived_at)
    return (
      <ErrorState error={new Error("Archived credentials are read only.")} />
    );

  return (
    <div>
      <PageHeader title={`Edit ${query.data.display_name ?? query.data.id}`} />
      <CredentialEditor key={query.data.updated_at} credential={query.data} />
    </div>
  );
}
