"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import { Badge } from "@/components/ui/badge";
import { useSkill, useSkillVersions } from "@/lib/platform/queries";
import type { SkillVersion } from "@/lib/platform/types";

const VERSION_COLUMNS: Column<SkillVersion>[] = [
  {
    key: "version",
    header: "Version",
    cell: (v) => <span className="font-mono text-[13px]">{v.version}</span>,
  },
  { key: "name", header: "Name", cell: (v) => v.name },
  {
    key: "description",
    header: "Description",
    className: "w-full",
    cell: (v) => v.description,
  },
  {
    key: "created",
    header: "Created",
    cell: (v) => <Time iso={v.created_at} />,
  },
];

export default function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: skill, error, isPending } = useSkill(id);
  const versions = useSkillVersions(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !skill) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div>
      <PageHeader
        title={skill.display_title}
        actions={
          <Badge variant="outline" className="font-normal">
            {skill.source}
          </Badge>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCode id={skill.id} />
          </Field>
          <Field label="Latest version">
            {skill.latest_version ? (
              <span className="font-mono text-[13px]">
                {skill.latest_version}
              </span>
            ) : (
              "none"
            )}
          </Field>
          <Field label="Created">
            <Time iso={skill.created_at} />
          </Field>
          <Field label="Updated">
            <Time iso={skill.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Versions">
        {versions.error ? (
          <ErrorState error={versions.error} />
        ) : (
          <DataTable
            columns={VERSION_COLUMNS}
            rows={versions.data?.data ?? []}
            rowKey={(v) => v.id}
            loading={versions.isPending}
            empty={<EmptyState title="No versions" />}
          />
        )}
      </DetailSection>
    </div>
  );
}
