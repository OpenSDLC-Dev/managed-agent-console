"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  DetailSection,
  Field,
  FieldList,
  JsonBlock,
} from "@/components/console/detail";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  ArchivedBadge,
  Day,
  EmptyState,
  ErrorState,
  DetailSkeleton,
} from "@/components/console/bits";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { ResourceActions } from "@/components/console/resource-actions";
import { IdCell } from "@/components/console/copy-id";
import { Pager } from "@/components/console/pager";
import { AddCredentialButton } from "@/components/console/credential-form";
import {
  AuthTypeBadge,
  CredentialAuthSummary,
} from "@/components/console/credential-auth";
import { Button } from "@/components/ui/button";
import {
  useArchiveCredential,
  useArchiveVault,
  useDeleteCredential,
  useDeleteVault,
  useValidateOAuthCredential,
  useVault,
  useVaultCredentials,
} from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { VaultCredential } from "@/lib/platform/types";

function CredentialActions({
  credential,
  vaultId,
  onValidated,
}: {
  credential: VaultCredential;
  vaultId: string;
  onValidated: (message: string, failed?: boolean) => void;
}) {
  const validate = useValidateOAuthCredential(vaultId);
  const archive = useArchiveCredential(vaultId);
  const remove = useDeleteCredential(vaultId);
  return (
    <div
      className="flex items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {credential.auth.type === "mcp_oauth" && !credential.archived_at && (
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          disabled={validate.isPending}
          onClick={() =>
            validate.mutate(credential.id, {
              onSuccess: (result) =>
                onValidated(
                  `OAuth validation: ${String(result.status ?? "ok")}`,
                ),
              onError: (error) =>
                onValidated(
                  error instanceof Error ? error.message : "validation failed",
                  true,
                ),
            })
          }
        >
          <ShieldCheck className="size-3.5" /> Validate
        </Button>
      )}
      <ResourceActions
        resource="credential"
        menuLabel={`Actions for ${credential.id}`}
        archived={!!credential.archived_at}
        archiveWarning="Its sealed secret is destroyed."
        deleteDescription="Deleting is permanent; the sealed secret is destroyed."
        onArchive={
          credential.archived_at
            ? undefined
            : () => archive.mutate(credential.id)
        }
        onDelete={() => remove.mutate(credential.id)}
        archivePending={archive.isPending}
        deletePending={remove.isPending}
      />
    </div>
  );
}

export default function VaultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: vault, error, isPending } = useVault(id);
  const [showArchived, setShowArchived] = useState(false);
  const pager = useCursorPage(String(showArchived));
  const credentials = useVaultCredentials(id, {
    page: pager.page,
    include_archived: showArchived || undefined,
  });
  const archive = useArchiveVault(id);
  const removeVault = useDeleteVault(id);
  const [notice, setNotice] = useState<{
    message: string;
    failed: boolean;
  } | null>(null);

  if (error) return <ErrorState error={error} />;
  if (isPending || !vault) {
    return <DetailSkeleton />;
  }

  const columns: Column<VaultCredential>[] = [
    { key: "id", header: "ID", cell: (c) => <IdCell id={c.id} /> },
    {
      key: "name",
      header: "Name",
      cell: (c) => (
        <span className="flex items-center gap-2">
          {c.display_name ?? <span className="text-muted-foreground">—</span>}
          <ArchivedBadge archivedAt={c.archived_at} />
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (c) => <AuthTypeBadge auth={c.auth} />,
    },
    {
      key: "auth",
      header: "Auth",
      className: "w-full",
      cell: (c) => <CredentialAuthSummary auth={c.auth} />,
    },
    {
      key: "actions",
      header: "",
      cell: (c) => (
        <CredentialActions
          credential={c}
          vaultId={id}
          onValidated={(message, failed) =>
            setNotice({ message, failed: !!failed })
          }
        />
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        parent={{ href: "/vaults", label: "Credential vaults" }}
        current={vault.display_name}
      />
      <PageHeader
        title={vault.display_name}
        actions={
          <div className="flex items-center gap-2">
            <ArchivedBadge archivedAt={vault.archived_at} />
            {!vault.archived_at && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => router.push(`/vaults/${id}/edit`)}
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            <ResourceActions
              resource="vault"
              archived={!!vault.archived_at}
              archiveWarning="Archiving purges every credential's sealed secret."
              deleteDescription="Deleting is permanent and cascades to every credential in the vault."
              onArchive={vault.archived_at ? undefined : () => archive.mutate()}
              onDelete={() =>
                removeVault.mutate(undefined, {
                  onSuccess: () => router.push("/vaults"),
                })
              }
              archivePending={archive.isPending}
              deletePending={removeVault.isPending}
            />
          </div>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={vault.id} />
          </Field>
          <Field label="Created">
            <Day iso={vault.created_at} />
          </Field>
          <Field label="Updated">
            <Day iso={vault.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Credentials">
        <div className="flex items-center justify-between gap-4 pb-3">
          <p className="text-[13px] text-muted-foreground">
            Secrets are write-only on the platform — this view can never show
            them. Archiving a vault purges every credential&apos;s sealed
            secret.
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived
            </label>
            {!vault.archived_at && <AddCredentialButton vaultId={id} />}
          </div>
        </div>
        {notice && (
          <p
            className={
              notice.failed
                ? "pb-2 text-[13px] text-destructive"
                : "pb-2 text-[13px]"
            }
            data-testid="credential-notice"
          >
            {notice.message}
          </p>
        )}
        {credentials.error ? (
          <ErrorState error={credentials.error} />
        ) : (
          <DataTable
            columns={columns}
            rows={credentials.data?.data ?? []}
            rowKey={(c) => c.id}
            loading={credentials.isPending}
            empty={<EmptyState title="No credentials in this vault" />}
            onRowClick={(credential) =>
              router.push(`/vaults/${id}/credentials/${credential.id}`)
            }
          />
        )}
        <Pager
          hasPrev={pager.hasPrev}
          hasNext={!!credentials.data?.next_page}
          onPrev={pager.goPrev}
          onNext={() =>
            credentials.data?.next_page &&
            pager.goNext(credentials.data.next_page)
          }
        />
      </DetailSection>
      {Object.keys(vault.metadata).length > 0 && (
        <DetailSection title="Metadata">
          <JsonBlock value={vault.metadata} />
        </DetailSection>
      )}
    </div>
  );
}
