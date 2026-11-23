"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import {
  useDeleteSkill,
  useDeleteSkillVersion,
  useSkill,
  useSkillVersions,
} from "@/lib/platform/queries";
import { platformGet } from "@/lib/platform/http";
import type { SkillVersion } from "@/lib/platform/types";
import { DetailSkeleton, EmptyState, ErrorState } from "./bits";
import { Breadcrumb } from "./breadcrumb";
import { CopyIdButton, IdCell } from "./copy-id";
import { Field, JsonBlock } from "./detail";
import { ResourceActions } from "./resource-actions";
import { ConfirmIconButton } from "./archive-button";
import { ResourceDownload } from "./resource-download";
import { ResourceDate } from "./library-format";
import { Pager } from "./pager";
import { PlaygroundViewSwitch } from "./playground-view-switch";
import { UpdateSkillDialog } from "./upload-skill-button";

function SkillDescription({
  id,
  latest,
  rows,
  loading,
}: {
  id: string;
  latest: string | null;
  rows: SkillVersion[];
  loading: boolean;
}) {
  const current = rows.find((version) => version.id === latest);
  // The latest version may be on a different page of version history.
  const exact = useQuery({
    queryKey: ["skill-version", id, latest],
    queryFn: () =>
      platformGet<SkillVersion>(
        "v1/skills/" +
          encodeURIComponent(id) +
          "/versions/" +
          encodeURIComponent(latest!),
      ),
    enabled: !!latest && !current && !loading,
  });
  const description = current?.description ?? exact.data?.description;
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-medium">Description</h3>
      {exact.error && !current ? (
        <ErrorState error={exact.error} />
      ) : (
        <p
          className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm"
          aria-busy={loading || exact.isFetching}
        >
          {description ?? (loading || exact.isFetching ? "Loading…" : "—")}
        </p>
      )}
    </section>
  );
}

export function SkillDetail({
  id,
  inspector = false,
  onDeleted,
}: {
  id: string;
  inspector?: boolean;
  onDeleted?: () => void;
}) {
  const [view, setView] = useState<"Rendered" | "API">("Rendered");
  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const { data: skill, error } = useSkill(id);
  const page = useCursorPage(id);
  const versions = useSkillVersions(id, page.page);
  const deleteVersion = useDeleteSkillVersion(id);
  const remove = useDeleteSkill(id);
  if (error) return <ErrorState error={error} />;
  if (!skill) return <DetailSkeleton />;
  const custom = skill.source.type === "custom";
  const rows = versions.data?.data ?? [];
  const Heading = inspector ? "h2" : "h1";
  return (
    <div className={inspector ? "flex h-full flex-col" : "max-w-4xl"}>
      {!inspector && (
        <Breadcrumb
          parent={{ href: "/skills", label: "Skills" }}
          current={skill.display_name}
        />
      )}
      <div className="mb-5 flex shrink-0 items-center justify-between gap-2">
        <Heading
          className={
            inspector
              ? "flex min-w-0 items-center gap-2 break-all text-sm font-medium"
              : "font-serif text-2xl"
          }
        >
          {inspector && <BookOpen className="size-4 shrink-0" />}
          {skill.display_name}
        </Heading>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={!custom}
            onClick={() => setUpdating(true)}
          >
            Update
          </Button>
          {custom && (
            <ResourceActions
              resource="skill"
              deleteDescription={
                "Deleting " +
                skill.display_name +
                " permanently deletes all its versions. Existing code that references this skill will stop working."
              }
              deletePending={remove.isPending}
              onDelete={() =>
                remove.mutate(undefined, {
                  onSuccess: () =>
                    onDeleted ? onDeleted() : router.push("/skills"),
                })
              }
            />
          )}
        </div>
      </div>
      <div className={inspector ? "min-h-0 flex-1 overflow-y-auto" : undefined}>
        {view === "API" ? (
          <>
            <code className="text-xs">
              GET /v1/skills/{encodeURIComponent(id)}
            </code>
            <JsonBlock value={skill} />
          </>
        ) : (
          <>
            <dl className="mb-6 grid grid-cols-[minmax(72px,25%)_1fr] gap-y-2 text-xs">
              <Field label="ID">
                <CopyIdButton showValue id={id} />
              </Field>
              <Field label="Created">
                <ResourceDate iso={skill.created_at} />
              </Field>
              <Field label="Updated">
                <ResourceDate iso={skill.updated_at} />
              </Field>
              <Field label="Source">
                <span data-source={skill.source.type} className="capitalize">
                  {skill.source.type}
                </span>
              </Field>
            </dl>
            {inspector && (
              <SkillDescription
                id={id}
                latest={skill.latest_version_id}
                rows={versions.isPlaceholderData ? [] : rows}
                loading={versions.isPending}
              />
            )}
            <section>
              <h3 className="mb-2 text-sm font-medium">Versions</h3>
              {versions.error ? (
                <ErrorState error={versions.error} />
              ) : versions.isPending ? (
                <DetailSkeleton />
              ) : rows.length ? (
                <ul aria-label="Skill versions" className="divide-y">
                  {rows.map((v) => (
                    <li
                      key={v.id}
                      data-version-id={v.id}
                      className="group/version flex flex-wrap items-center gap-2 py-2 text-xs"
                    >
                      <IdCell id={v.id} />
                      <ResourceDate iso={v.created_at} />
                      {v.id === skill.latest_version_id && (
                        <Badge data-latest="true" variant="secondary">
                          Latest
                        </Badge>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1 opacity-0 group-hover/version:opacity-100 group-focus-within/version:opacity-100 [@media(hover:none)]:opacity-100">
                        <ResourceDownload
                          aria-label={"Download version " + v.id}
                          className="p-1"
                          filename={v.id + ".zip"}
                          path={
                            "v1/skills/" +
                            encodeURIComponent(id) +
                            "/versions/" +
                            encodeURIComponent(v.id) +
                            "/content"
                          }
                        >
                          <Download className="size-3.5" />
                        </ResourceDownload>
                        {custom && (
                          <ConfirmIconButton
                            label={"Delete version " + v.id}
                            title="Delete version"
                            description="Deleting a skill version is permanent. The last version can only be removed by deleting the skill."
                            pending={deleteVersion.isPending}
                            onConfirm={() => deleteVersion.mutate(v.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </ConfirmIconButton>
                        )}
                      </span>
                      {!inspector && (
                        <div className="w-full text-sm">
                          <p className="font-medium">{v.name}</p>
                          <p className="whitespace-pre-wrap text-muted-foreground">
                            {v.description}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No versions" />
              )}
              {(page.hasPrev || !!versions.data?.next_page) && (
                <Pager
                  hasPrev={page.hasPrev && !versions.isFetching}
                  hasNext={!!versions.data?.next_page && !versions.isFetching}
                  onPrev={page.goPrev}
                  onNext={() => {
                    if (versions.data?.next_page)
                      page.goNext(versions.data.next_page);
                  }}
                />
              )}
            </section>
          </>
        )}
      </div>
      <div className="flex justify-end pt-3">
        <PlaygroundViewSwitch
          label="Pane view"
          options={["Rendered", "API"]}
          value={view}
          onChange={setView}
        />
      </div>
      {updating && custom && (
        <UpdateSkillDialog
          id={id}
          onClose={() => {
            setUpdating(false);
            page.first();
          }}
        />
      )}
    </div>
  );
}
