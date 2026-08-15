"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  DetailSection,
  Field,
  FieldList,
  JsonBlock,
} from "@/components/console/detail";
import {
  ArchivedBadge,
  Day,
  ErrorState,
  HostingType,
  DetailSkeleton,
} from "@/components/console/bits";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { IdCell } from "@/components/console/copy-id";
import { ResourceActions } from "@/components/console/resource-actions";
import { EnvironmentKeysSection } from "@/components/console/environment-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useArchiveEnvironment,
  useDeleteEnvironment,
  useEnvironment,
} from "@/lib/platform/queries";

export default function EnvironmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: environment, error, isPending } = useEnvironment(id);
  const archive = useArchiveEnvironment(id);
  const remove = useDeleteEnvironment(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !environment) {
    return <DetailSkeleton />;
  }

  const config = environment.config;
  return (
    <div>
      <Breadcrumb
        parent={{ href: "/environments", label: "Environments" }}
        current={environment.name}
      />
      <PageHeader
        title={environment.name}
        subtitle={environment.description || undefined}
        actions={
          <span className="flex items-center gap-2">
            <ArchivedBadge archivedAt={environment.archived_at} />
            {!environment.archived_at && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => router.push(`/environments/${id}/edit`)}
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            <ResourceActions
              resource="environment"
              archived={!!environment.archived_at}
              archiveWarning="Sessions can no longer be created in it."
              deleteDescription="Deleting is permanent and cannot be undone. The platform refuses if any session still references this environment."
              onArchive={
                environment.archived_at ? undefined : () => archive.mutate()
              }
              onDelete={() =>
                remove.mutate(undefined, {
                  onSuccess: () => router.push("/environments"),
                })
              }
              archivePending={archive.isPending}
              deletePending={remove.isPending}
            />
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={environment.id} />
          </Field>
          <Field label="Type">
            <Badge variant="outline" className="font-normal">
              <HostingType type={config.type} />
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
            <Day iso={environment.created_at} />
          </Field>
          <Field label="Updated">
            <Day iso={environment.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <EnvironmentKeysSection environment={environment} />
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
