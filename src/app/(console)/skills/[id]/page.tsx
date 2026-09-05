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
import { Pager } from "@/components/console/pager";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
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
  const pagination = useCursorPage(id);
  const versions = useSkillVersions(id, pagination.page);
  const uploadVersion = useUploadSkillVersion(id);
  const deleteVersion = useDeleteSkillVersion(id);
  const deleteSkill = useDeleteSkill(id);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  if (error) return <ErrorState error={error} />;
  if (isPending || !skill) {
    return <DetailSkeleton />;
  }

  const custom = skill.source.type === "custom";
  const versionRows = versions.data?.data ?? [];

  const columns: Column<SkillVersion>[] = [
    {
      key: "version",
      header: "Version ID",
      cell: (v) => <span className="font-mono text-[13px]">{v.id}</span>,
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
            href={`/api/platform/v1/skills/${id}/versions/${v.id}/content`}
            download
            aria-label={`Download version ${v.id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="size-3.5" />
          </a>
          {custom && (
            <ConfirmIconButton
              label={`Delete version ${v.id}`}
              title="Delete version"
              description="Deleting a skill version is permanent. The last version can only be removed by deleting the skill."
              pending={deleteVersion.isPending}
              onConfirm={() => deleteVersion.mutate(v.id)}
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
        current={skill.display_name}
      />
      <PageHeader
        title={skill.display_name}
        actions={
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {skill.source.type}
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
                <input
                  ref={folderInput}
                  type="file"
                  multiple
                  {...{ webkitdirectory: "" }}
                  aria-label="New version folder"
                  className="hidden"
                  onChange={(e) => {
                    const picked = [...(e.target.files ?? [])];
                    if (picked.length > 0) uploadVersion.mutate(picked);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  disabled={uploadVersion.isPending}
                  onClick={() => folderInput.current?.click()}
                >
                  Upload folder
                </Button>
                <ResourceActions
                  resource="skill"
                  deleteDescription="Deleting this skill permanently deletes all its versions."
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
          <Field label="Latest version ID">
            {skill.latest_version_id ? (
              <span className="font-mono text-[13px]">
                {skill.latest_version_id}
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
      <Pager
        hasPrev={pagination.hasPrev}
        hasNext={Boolean(versions.data?.next_page)}
        onPrev={pagination.goPrev}
        onNext={() => {
          if (versions.data?.next_page)
            pagination.goNext(versions.data.next_page);
        }}
      />
    </div>
  );
}
