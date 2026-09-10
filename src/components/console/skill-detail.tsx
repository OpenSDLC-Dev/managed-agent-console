"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Upload } from "lucide-react";
import { DetailSection, Field, JsonBlock } from "@/components/console/detail";
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

export function SkillDetail({
  id,
  inspector = false,
  onDeleted,
}: {
  id: string;
  inspector?: boolean;
  onDeleted?: () => void;
}) {
  const [view, setView] = useState("rendered");
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

  const Heading = inspector ? "h2" : "h1";
  const custom = skill.source.type === "custom";
  const versionRows = versions.data?.data ?? [];

  const columns: Column<SkillVersion>[] = [
    {
      key: "version",
      header: "Version ID",
      cell: (v) => <IdCell id={v.id} />,
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
        <span className="cursor-pointer">
          {/* Zip download streams through the BFF; dual-auth on the wire. */}
          <a
            href={`/api/platform/v1/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(v.id)}/content`}
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
    <div className={inspector ? "flex h-full flex-col" : undefined}>
      {!inspector && (
        <Breadcrumb
          parent={{ href: "/skills", label: "Skills" }}
          current={skill.display_name}
        />
      )}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 pb-5">
        <Heading
          className={
            inspector
              ? "min-w-0 break-words text-sm font-medium"
              : "min-w-0 break-words text-[22px] font-medium leading-7"
          }
        >
          {skill.display_name}
        </Heading>
        <span className="flex flex-wrap items-center gap-2">
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
                    onSuccess: () =>
                      onDeleted ? onDeleted() : router.push("/skills"),
                  })
                }
                deletePending={deleteSkill.isPending}
              />
            </>
          )}
        </span>
      </div>
      <fieldset
        className={
          inspector
            ? "order-last flex shrink-0 justify-end gap-1 pt-3 text-[13px]"
            : "mb-5 flex gap-1 text-sm"
        }
      >
        <legend className="sr-only">Pane view</legend>
        {["rendered", "api"].map((value) => (
          <label key={value} className="flex items-center gap-1.5">
            <input
              className="peer sr-only"
              type="radio"
              name={"skill-view-" + id}
              value={value}
              checked={view === value}
              onChange={() => setView(value)}
            />
            <span className="inline-block rounded-md border border-transparent px-2 py-1 text-muted-foreground peer-checked:border-border peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {value === "api" ? "API" : "Rendered"}
            </span>
          </label>
        ))}
      </fieldset>
      <div className={inspector ? "min-h-0 flex-1 overflow-y-auto" : undefined}>
        {view === "api" ? (
          <div className="space-y-3">
            <code className="break-all text-sm">
              GET /v1/skills/{encodeURIComponent(id)}
            </code>
            <JsonBlock value={skill} />
          </div>
        ) : (
          <>
            <DetailSection title="Overview">
              <dl className="grid grid-cols-[minmax(80px,35%)_1fr] gap-y-2 text-sm">
                <Field label="ID">
                  <IdCell id={skill.id} />
                </Field>
                <Field label="Latest version ID">
                  {skill.latest_version_id ? (
                    <IdCell id={skill.latest_version_id} />
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
              </dl>
            </DetailSection>
            <DetailSection title="Versions">
              {versions.error ? (
                <ErrorState error={versions.error} />
              ) : inspector ? (
                <div
                  aria-busy={versions.isPending || undefined}
                  className="divide-y"
                >
                  {versionRows.map((v) => (
                    <div key={v.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <IdCell id={v.id} />
                        {v.id === skill.latest_version_id && (
                          <Badge variant="outline" data-latest="true">
                            Latest
                          </Badge>
                        )}
                        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                          <Day iso={v.created_at} />
                          {columns.at(-1)!.cell(v)}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{v.name}</p>
                      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {v.description}
                      </p>
                    </div>
                  ))}
                  {!versions.isPending && !versionRows.length && (
                    <EmptyState title="No versions" />
                  )}
                </div>
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
              hasPrev={pagination.hasPrev && !versions.isFetching}
              hasNext={
                Boolean(versions.data?.next_page) && !versions.isFetching
              }
              onPrev={pagination.goPrev}
              onNext={() => {
                if (versions.data?.next_page)
                  pagination.goNext(versions.data.next_page);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
