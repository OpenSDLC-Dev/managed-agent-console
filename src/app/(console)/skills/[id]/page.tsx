"use client";

import { use, useRef } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import {
  ConfirmIconButton,
  DeleteButton,
} from "@/components/console/archive-button";
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
    return <div className="text-sm text-muted-foreground">Loading…</div>;
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
      cell: (v) => <Time iso={v.created_at} />,
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
                <DeleteButton
                  resource="skill"
                  description="The platform only deletes a skill with zero remaining versions — delete the versions first."
                  pending={deleteSkill.isPending}
                  onConfirm={() =>
                    deleteSkill.mutate(undefined, {
                      onSuccess: () => router.push("/skills"),
                    })
                  }
                />
              </>
            )}
          </span>
        }
      />
      {(uploadVersion.error instanceof Error ||
        deleteSkill.error instanceof Error ||
        deleteVersion.error instanceof Error) && (
        <p className="pb-4 text-sm text-destructive">
          {
            (uploadVersion.error ?? deleteSkill.error ?? deleteVersion.error)
              ?.message
          }
        </p>
      )}
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
