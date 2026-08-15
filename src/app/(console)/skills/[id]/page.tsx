"use client";

import { use, useRef } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  Day,
  EmptyState,
  ErrorState,
  DetailSkeleton,
} from "@/components/console/bits";
import { ConfirmIconButton } from "@/components/console/archive-button";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { ResourceActions } from "@/components/console/resource-actions";
import { IdCell } from "@/components/console/copy-id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useDeleteSkill,
  useDeleteSkillVersion,
  useSkill,
  useSkillVersions,
  useUploadSkillVersion,
} from "@/lib/platform/queries";
import type { SkillVersion } from "@/lib/platform/types";

export default function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: skill, error, isPending } = useSkill(id);
  const versions = useSkillVersions(id);
  const uploadVersion = useUploadSkillVersion(id);
  const deleteVersion = useDeleteSkillVersion(id);
  const deleteSkill = useDeleteSkill(id);
  const input = useRef<HTMLInputElement>(null);

  if (error) return <ErrorState error={error} />;
  if (isPending || !skill) {
    return <DetailSkeleton />;
  }

  const custom = skill.source === "custom";
  const versionRows = versions.data?.data ?? [];

  const columns: Column<SkillVersion>[] = [
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
      cell: (v) => <Day iso={v.created_at} />,
    },
    {
      key: "actions",
      header: "",
      cell: (v) => (
        <span className="flex items-center gap-1.5">
          {/* Zip download streams through the BFF; dual-auth on the wire. */}
          <a
            href={`/api/platform/v1/skills/${id}/versions/${v.version}/content`}
            download
            aria-label={`Download version ${v.version}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="size-3.5" />
          </a>
          {custom && (
            <ConfirmIconButton
              label={`Delete version ${v.version}`}
              title="Delete version"
              description="Deleting a skill version is permanent."
              pending={deleteVersion.isPending}
              onConfirm={() => deleteVersion.mutate(v.version)}
            >
              <Trash2 className="size-3.5" />
            </ConfirmIconButton>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        parent={{ href: "/skills", label: "Skills" }}
        current={skill.display_title}
      />
      <PageHeader
        title={skill.display_title}
        actions={
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {skill.source}
            </Badge>
            {custom && (
              <>
                <input
                  ref={input}
                  type="file"
                  multiple
                  aria-label="New version files"
                  className="hidden"
                  onChange={(e) => {
                    const picked = [...(e.target.files ?? [])];
                    if (picked.length > 0) uploadVersion.mutate(picked);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={uploadVersion.isPending}
                  onClick={() => input.current?.click()}
                >
                  <Upload className="size-4" />
                  {uploadVersion.isPending ? "Uploading…" : "New version"}
                </Button>
                <ResourceActions
                  resource="skill"
                  deleteDescription="The platform only deletes a skill with zero remaining versions — delete the versions first."
                  onDelete={() =>
                    deleteSkill.mutate(undefined, {
                      onSuccess: () => router.push("/skills"),
                    })
                  }
                  deletePending={deleteSkill.isPending}
                />
              </>
            )}
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={skill.id} />
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
            <Day iso={skill.created_at} />
          </Field>
          <Field label="Updated">
            <Day iso={skill.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Versions">
        {versions.error ? (
          <ErrorState error={versions.error} />
        ) : (
          <DataTable
            columns={columns}
            rows={versionRows}
            rowKey={(v) => v.id}
            loading={versions.isPending}
            empty={<EmptyState title="No versions" />}
          />
        )}
      </DetailSection>
    </div>
  );
}
