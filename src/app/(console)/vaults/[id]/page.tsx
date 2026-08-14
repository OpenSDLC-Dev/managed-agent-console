"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Trash2 } from "lucide-react";
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
  IdCode,
  DetailSkeleton,
} from "@/components/console/bits";
import {
  ArchiveButton,
  ConfirmIconButton,
  DeleteButton,
} from "@/components/console/archive-button";
import { AddCredentialButton } from "@/components/console/credential-form";
import {
  AuthTypeBadge,
  CredentialAuthSummary,
} from "@/components/console/credential-auth";
import { Button } from "@/components/ui/button";
import {
  useArchiveVault,
  useDeleteCredential,
  useDeleteVault,
  useValidateOAuthCredential,
  useVault,
  useVaultCredentials,
} from "@/lib/platform/queries";
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
  const remove = useDeleteCredential(vaultId);
  return (
    <span className="flex items-center gap-1.5">
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
      <ConfirmIconButton
        label={`Delete credential ${credential.id}`}
        title="Delete credential"
        description="Deleting a credential is permanent; its sealed secret is destroyed."
        pending={remove.isPending}
        onConfirm={() => remove.mutate(credential.id)}
      >
        <Trash2 className="size-3.5" />
      </ConfirmIconButton>
    </span>
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
  const credentials = useVaultCredentials(id);
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
    { key: "id", header: "ID", cell: (c) => <IdCode id={c.id} /> },
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
      <PageHeader
        title={vault.display_name}
        actions={
          <span className="flex items-center gap-2">
            <ArchivedBadge archivedAt={vault.archived_at} />
            {!vault.archived_at && (
              <ArchiveButton
                resource="vault"
                warning="Archiving purges every credential's sealed secret."
                onConfirm={() => archive.mutate()}
                pending={archive.isPending}
              />
            )}
            <DeleteButton
              resource="vault"
              description="Deleting is permanent and cascades to every credential in the vault."
              pending={removeVault.isPending}
              onConfirm={() =>
                removeVault.mutate(undefined, {
                  onSuccess: () => router.push("/vaults"),
                })
              }
            />
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCode id={vault.id} />
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
        <div className="flex items-center justify-between pb-3">
          <p className="text-[13px] text-muted-foreground">
            Secrets are write-only on the platform — this view can never show
            them. Archiving a vault purges every credential&apos;s sealed
            secret.
          </p>
          {!vault.archived_at && <AddCredentialButton vaultId={id} />}
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
          />
        )}
      </DetailSection>
      {Object.keys(vault.metadata).length > 0 && (
        <DetailSection title="Metadata">
          <JsonBlock value={vault.metadata} />
        </DetailSection>
      )}
    </div>
  );
}
