"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Breadcrumb } from "@/components/console/breadcrumb";
import {
  ArchivedBadge,
  Day,
  DetailSkeleton,
  ErrorState,
} from "@/components/console/bits";
import {
  AuthTypeBadge,
  CredentialAuthSummary,
} from "@/components/console/credential-auth";
import { IdCell } from "@/components/console/copy-id";
import {
  DetailSection,
  Field,
  FieldList,
  JsonBlock,
} from "@/components/console/detail";
import { ResourceActions } from "@/components/console/resource-actions";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  useArchiveCredential,
  useDeleteCredential,
  useVault,
  useVaultCredential,
} from "@/lib/platform/queries";

export default function CredentialDetailPage({
  params,
}: {
  params: Promise<{ id: string; credentialId: string }>;
}) {
  const { id, credentialId } = use(params);
  const router = useRouter();
  const vault = useVault(id);
  const credential = useVaultCredential(id, credentialId);
  const archive = useArchiveCredential(id);
  const remove = useDeleteCredential(id);

  if (vault.error) return <ErrorState error={vault.error} />;
  if (credential.error) return <ErrorState error={credential.error} />;
  if (
    vault.isPending ||
    credential.isPending ||
    !vault.data ||
    !credential.data
  )
    return <DetailSkeleton />;

  const item = credential.data;
  const name = item.display_name ?? item.id;
  return (
    <div>
      <Breadcrumb
        parent={{ href: `/vaults/${id}`, label: vault.data.display_name }}
        current={name}
      />
      <PageHeader
        title={name}
        actions={
          <div className="flex items-center gap-2">
            <ArchivedBadge archivedAt={item.archived_at} />
            {!item.archived_at && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  router.push(`/vaults/${id}/credentials/${credentialId}/edit`)
                }
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            <ResourceActions
              resource="credential"
              menuLabel={`Actions for ${item.id}`}
              archived={!!item.archived_at}
              archiveWarning="Its sealed secret is destroyed."
              deleteDescription="Deleting is permanent; the sealed secret is destroyed."
              onArchive={
                item.archived_at
                  ? undefined
                  : () => archive.mutate(credentialId)
              }
              onDelete={() =>
                remove.mutate(credentialId, {
                  onSuccess: () => router.push(`/vaults/${id}`),
                })
              }
              archivePending={archive.isPending}
              deletePending={remove.isPending}
            />
          </div>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={item.id} />
          </Field>
          <Field label="Type">
            <AuthTypeBadge auth={item.auth} />
          </Field>
          <Field label="Authentication">
            <CredentialAuthSummary auth={item.auth} />
          </Field>
          <Field label="Created">
            <Day iso={item.created_at} />
          </Field>
          <Field label="Updated">
            <Day iso={item.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Metadata">
        <JsonBlock value={item.metadata} />
      </DetailSection>
    </div>
  );
}
