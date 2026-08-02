"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import {
  DetailSection,
  Field,
  FieldList,
  JsonBlock,
} from "@/components/console/detail";
import {
  ArchivedBadge,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import { Badge } from "@/components/ui/badge";
import { useEnvironment } from "@/lib/platform/queries";

export default function EnvironmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: environment, error, isPending } = useEnvironment(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !environment) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const config = environment.config;
  return (
    <div>
      <PageHeader
        title={environment.name}
        subtitle={environment.description || undefined}
        actions={<ArchivedBadge archivedAt={environment.archived_at} />}
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCode id={environment.id} />
          </Field>
          <Field label="Type">
            <Badge variant="outline" className="font-normal">
              {config.type}
            </Badge>
          </Field>
          {config.type === "cloud" && (
            <Field label="Networking">
              {config.networking.type === "unrestricted"
                ? "unrestricted"
                : `limited — ${config.networking.allowed_hosts.join(", ")}`}
            </Field>
          )}
          <Field label="Created">
            <Time iso={environment.created_at} />
          </Field>
          <Field label="Updated">
            <Time iso={environment.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Config">
        <JsonBlock value={config} />
      </DetailSection>
      {Object.keys(environment.metadata).length > 0 && (
        <DetailSection title="Metadata">
          <JsonBlock value={environment.metadata} />
        </DetailSection>
      )}
    </div>
  );
}
