"use client";

import { use } from "react";
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
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import {
  AuthTypeBadge,
  CredentialAuthSummary,
} from "@/components/console/credential-auth";
import { useVault, useVaultCredentials } from "@/lib/platform/queries";
import type { VaultCredential } from "@/lib/platform/types";

const CREDENTIAL_COLUMNS: Column<VaultCredential>[] = [
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
  { key: "type", header: "Type", cell: (c) => <AuthTypeBadge auth={c.auth} /> },
  {
    key: "auth",
    header: "Auth",
    className: "w-full",
    cell: (c) => <CredentialAuthSummary auth={c.auth} />,
  },
  {
    key: "created",
    header: "Created",
    cell: (c) => <Time iso={c.created_at} />,
  },
];

export default function VaultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: vault, error, isPending } = useVault(id);
  const credentials = useVaultCredentials(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !vault) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div>
      <PageHeader
        title={vault.display_name}
        actions={<ArchivedBadge archivedAt={vault.archived_at} />}
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCode id={vault.id} />
          </Field>
          <Field label="Created">
            <Time iso={vault.created_at} />
          </Field>
          <Field label="Updated">
            <Time iso={vault.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Credentials">
        <p className="pb-3 text-[13px] text-muted-foreground">
          Secrets are write-only on the platform — this view can never show
          them. Archiving a vault purges every credential&apos;s sealed secret.
        </p>
        {credentials.error ? (
          <ErrorState error={credentials.error} />
        ) : (
          <DataTable
            columns={CREDENTIAL_COLUMNS}
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
