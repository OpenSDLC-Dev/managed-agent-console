"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
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
import { ArchiveButton } from "@/components/console/archive-button";
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
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        actions={
          <span className="flex items-center gap-2">
            <ArchivedBadge archivedAt={environment.archived_at} />
            {!environment.archived_at && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => router.push(`/environments/${id}/edit`)}
                >
                  <Pencil className="size-4" /> Edit
                </Button>
                <ArchiveButton
                  resource="environment"
                  warning="Sessions can no longer be created in it."
                  onConfirm={() => archive.mutate()}
                  pending={archive.isPending}
                />
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => router.push("/environments"),
                  onError: (err) =>
                    setDeleteError(
                      err instanceof Error ? err.message : "delete failed",
                    ),
                })
              }
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </span>
        }
      />
      {deleteError && (
        <p className="pb-4 text-sm text-destructive">{deleteError}</p>
      )}
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
