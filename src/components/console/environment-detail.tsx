"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";
import { DetailSection, Field, JsonBlock } from "./detail";
import {
  Time,
  ErrorState,
  HostingType,
  ResourceStatus,
  DetailSkeleton,
} from "./bits";
import { Breadcrumb } from "./breadcrumb";
import { IdCell } from "./copy-id";
import { ResourceActions } from "./resource-actions";
import { EnvironmentKeysSection } from "./environment-keys";
import { EnvironmentEditor, formFromEnvironment } from "./environment-editor";
import { Button } from "@/components/ui/button";
import {
  useArchiveEnvironment,
  useDeleteEnvironment,
  useEnvironment,
} from "@/lib/platform/queries";

export function EnvironmentDetail({
  id,
  inspector = false,
  onDeleted,
}: {
  id: string;
  inspector?: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState("rendered");
  const [editing, setEditing] = useState(false);
  const { data: environment, error, isPending } = useEnvironment(id);
  const archive = useArchiveEnvironment(id);
  const remove = useDeleteEnvironment(id);
  const breadcrumb = !inspector && (
    <Breadcrumb
      parent={{ href: "/environments", label: "Environments" }}
      current={environment?.name ?? id}
    />
  );
  if (error)
    return (
      <>
        {breadcrumb}
        <ErrorState error={error} />
      </>
    );
  if (isPending || !environment) return <DetailSkeleton />;
  const config = environment.config;
  const Heading = inspector ? "h2" : "h1";
  const fields =
    "grid grid-cols-[minmax(80px,23%)_1fr] gap-x-4 gap-y-2 text-xs leading-[17px]";
  return (
    <div
      className={
        inspector ? "flex h-full flex-col [&_section_h2]:text-sm" : undefined
      }
    >
      {breadcrumb}
      <div
        className={
          "flex shrink-0 flex-wrap items-start justify-between gap-3 " +
          (inspector ? "pb-4" : "pb-5")
        }
      >
        <Heading
          className={
            inspector
              ? "min-w-0 break-words text-base font-medium leading-5"
              : "min-w-0 break-words text-[22px] font-medium leading-7"
          }
        >
          {environment.name}
        </Heading>
        <span className="flex items-center gap-2">
          {inspector ? (
            <Link
              href={"/environments/" + encodeURIComponent(id)}
              className="flex h-6 items-center gap-1 rounded-md border px-2 text-[13px]"
            >
              Open <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            !environment.archived_at &&
            !editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            )
          )}
          {!editing && (
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
                  onSuccess: () =>
                    onDeleted ? onDeleted() : router.push("/environments"),
                })
              }
              archivePending={archive.isPending}
              deletePending={remove.isPending}
            />
          )}
        </span>
      </div>
      {editing ? (
        <EnvironmentEditor
          mode="edit"
          initial={formFromEnvironment(environment)}
          environmentId={id}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
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
                  type="radio"
                  className="peer sr-only"
                  name={"environment-view-" + id}
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
          <div
            className={inspector ? "min-h-0 flex-1 overflow-y-auto" : undefined}
          >
            {view === "api" ? (
              <div className="space-y-3">
                <code className="break-all text-sm">
                  GET /v1/environments/{encodeURIComponent(id)}
                </code>
                <JsonBlock value={environment} />
              </div>
            ) : (
              <>
                <dl className={fields + " pb-8"}>
                  {!inspector && (
                    <Field label="ID">
                      <IdCell id={id} />
                    </Field>
                  )}
                  <Field label="Created">
                    <Time iso={environment.created_at} />
                  </Field>
                  <Field label="Updated">
                    <Time iso={environment.updated_at} />
                  </Field>
                  <Field label="State">
                    <ResourceStatus archivedAt={environment.archived_at} />
                  </Field>
                  <Field label="Type">
                    <HostingType type={config.type} />
                  </Field>
                  <Field label="Scope">
                    {environment.scope === "organization"
                      ? "Organization"
                      : environment.scope}
                  </Field>
                </dl>
                <DetailSection title="Description">
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {environment.description || (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </p>
                </DetailSection>
                {config.type === "cloud" && (
                  <>
                    <DetailSection title="Networking">
                      <dl className={fields}>
                        <Field label="Type">
                          {config.networking.type === "limited"
                            ? "Limited"
                            : "Unrestricted"}
                        </Field>
                        {config.networking.type === "limited" && (
                          <>
                            <Field label="MCP access">
                              {config.networking.allow_mcp_servers
                                ? "Enabled"
                                : "Disabled"}
                            </Field>
                            <Field label="Packages">
                              {config.networking.allow_package_managers
                                ? "Enabled"
                                : "Disabled"}
                            </Field>
                            <Field label="Allowed hosts">
                              {config.networking.allowed_hosts.length
                                ? config.networking.allowed_hosts.join(", ")
                                : "None"}
                            </Field>
                          </>
                        )}
                      </dl>
                    </DetailSection>
                    <DetailSection title="Packages">
                      {Object.values(config.packages).some(
                        (packages) =>
                          Array.isArray(packages) && packages.length > 0,
                      ) ? (
                        <dl className={fields}>
                          {(
                            ["apt", "cargo", "gem", "go", "npm", "pip"] as const
                          )
                            .filter(
                              (manager) => config.packages[manager].length,
                            )
                            .map((manager) => (
                              <Field key={manager} label={manager}>
                                {config.packages[manager].join(", ")}
                              </Field>
                            ))}
                        </dl>
                      ) : (
                        <p className="text-sm text-muted-foreground">None</p>
                      )}
                    </DetailSection>
                  </>
                )}
                <DetailSection title="Metadata">
                  {Object.keys(environment.metadata).length ? (
                    <dl className={fields}>
                      {Object.entries(environment.metadata).map(
                        ([key, value]) => (
                          <Field key={key} label={key}>
                            {value}
                          </Field>
                        ),
                      )}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">None</p>
                  )}
                </DetailSection>
                {!inspector && (
                  <EnvironmentKeysSection environment={environment} />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
