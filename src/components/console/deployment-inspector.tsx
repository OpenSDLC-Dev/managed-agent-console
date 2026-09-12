"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAgentVersion,
  useDeployment,
  useEnvironment,
  useFile,
  useMemoryStore,
  useVault,
} from "@/lib/platform/queries";
import type { Deployment, DeploymentResource } from "@/lib/platform/types";
import { ResourceInspector } from "./resource-inspector";
import { DetailSkeleton, ErrorState, IdCode, StatusBadge, Time } from "./bits";
import { Field, JsonBlock } from "./detail";
import { CopyIdButton } from "./copy-id";
import { initialMessageFromEvents } from "./deployment-editor";

export function DeploymentInspector(
  props: Omit<ComponentProps<typeof ResourceInspector>, "kind" | "children">,
) {
  return (
    <ResourceInspector {...props} kind="deployment">
      <DeploymentSummary key={props.id} id={props.id} />
    </ResourceInspector>
  );
}

function AgentLink({ agent }: { agent: Deployment["agent"] }) {
  const query = useAgentVersion(agent.id, String(agent.version));
  return (
    <Link
      className="break-words hover:underline"
      href={`/agents/${encodeURIComponent(agent.id)}?version=${agent.version}`}
    >
      {query.data?.name ?? <IdCode id={agent.id} />} · v{agent.version}
    </Link>
  );
}

function EnvironmentLink({ id }: { id: string }) {
  const query = useEnvironment(id);
  return (
    <Link
      className="break-words hover:underline"
      href={`/environments/${encodeURIComponent(id)}`}
    >
      {query.data?.name ?? <IdCode id={id} />}
    </Link>
  );
}

function VaultLink({ id }: { id: string }) {
  const query = useVault(id);
  return (
    <Link
      className="block break-words hover:underline"
      href={`/vaults/${encodeURIComponent(id)}`}
    >
      {query.data?.display_name ?? <IdCode id={id} />}
    </Link>
  );
}

function FileReference({ id }: { id: string }) {
  const query = useFile(id);
  return (
    <div className="space-y-1">
      <Link className="break-all hover:underline" href="/files">
        {query.data?.filename ?? id}
      </Link>
      <span className="flex min-w-0 items-center gap-1 text-xs">
        <code className="break-all">{id}</code>
        <CopyIdButton id={id} />
      </span>
    </div>
  );
}

function MemoryReference({
  resource,
}: {
  resource: Extract<DeploymentResource, { type: "memory_store" }>;
}) {
  const query = useMemoryStore(resource.memory_store_id);
  return (
    <div className="space-y-2">
      <Link
        className="break-words hover:underline"
        href={`/memory-stores/${encodeURIComponent(resource.memory_store_id)}`}
      >
        {query.data?.name ?? <IdCode id={resource.memory_store_id} />}
      </Link>
      <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-2 text-xs">
        <Field label="Access">
          <span data-access={resource.access}>
            {resource.access === "read_only"
              ? "Read only"
              : resource.access === "read_write"
                ? "Read/write"
                : "Default"}
          </span>
        </Field>
        <Field label="Instructions">
          <p className="whitespace-pre-wrap break-words">
            {resource.instructions || "—"}
          </p>
        </Field>
      </dl>
    </div>
  );
}

function DeploymentSummary({ id }: { id: string }) {
  const query = useDeployment(id);
  const [api, setApi] = useState(false);
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return <DetailSkeleton />;
  const deployment = query.data;
  const message = initialMessageFromEvents(
    JSON.stringify(deployment.initial_events),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 pb-4">
        <Play className="size-4 shrink-0" />
        <h2
          className="min-w-0 flex-1 truncate font-medium"
          title={deployment.name}
        >
          {deployment.name}
        </h2>
        <Button
          size="sm"
          variant="outline"
          render={<Link href={`/deployments/${encodeURIComponent(id)}`} />}
        >
          Open <ArrowRight className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
        {api ? (
          <JsonBlock value={deployment} />
        ) : (
          <>
            <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-sm">
              <Field label="State">
                <span
                  data-status={
                    deployment.archived_at ? "archived" : deployment.status
                  }
                >
                  <StatusBadge
                    status={
                      deployment.archived_at ? "archived" : deployment.status
                    }
                  />
                </span>
              </Field>
              {deployment.paused_reason && (
                <Field label="Paused reason">
                  <span data-paused-reason={deployment.paused_reason.type}>
                    {deployment.paused_reason.type === "manual"
                      ? "Manual"
                      : deployment.paused_reason.error.type}
                  </span>
                </Field>
              )}
              <Field label="Agent">
                <AgentLink agent={deployment.agent} />
              </Field>
              <Field label="Environment">
                <EnvironmentLink id={deployment.environment_id} />
              </Field>
              <Field label="Created">
                <Time iso={deployment.created_at} />
              </Field>
            </dl>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Description</h3>
              <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">
                {deployment.description || "—"}
              </p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">
                {message === null ? "Initial events" : "Initial message"}
              </h3>
              {message === null ? (
                <JsonBlock value={deployment.initial_events} />
              ) : (
                <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">
                  {message}
                </p>
              )}
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Trigger</h3>
              {deployment.schedule ? (
                <>
                  <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-sm">
                    <Field label="Cron">
                      <code className="break-all">
                        {deployment.schedule.expression}
                      </code>
                    </Field>
                    <Field label="Timezone">
                      {deployment.schedule.timezone}
                    </Field>
                  </dl>
                  <div className="space-y-2 rounded-lg border p-3 text-xs">
                    <p>
                      Next runs (UTC)
                      {deployment.status === "paused" ? " if resumed" : ""}
                    </p>
                    {deployment.schedule.upcoming_runs_at.length ? (
                      deployment.schedule.upcoming_runs_at.map((at) => (
                        <div key={at}>
                          <Time iso={at} />
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No upcoming runs.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm">Manual</p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Credential vaults</h3>
              {deployment.vault_ids.length ? (
                deployment.vault_ids.map((vaultId) => (
                  <VaultLink key={vaultId} id={vaultId} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No vaults configured.
                </p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Session resources</h3>
              {deployment.resources.map((resource, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border p-3 text-sm"
                >
                  <p className="text-xs text-muted-foreground">
                    {resource.type === "memory_store"
                      ? "Memory store"
                      : resource.type === "file"
                        ? "File"
                        : "GitHub repository"}
                  </p>
                  {resource.type === "file" ? (
                    <FileReference id={resource.file_id} />
                  ) : resource.type === "memory_store" ? (
                    <MemoryReference resource={resource} />
                  ) : (
                    <>
                      <a
                        className="break-all underline"
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {resource.url}
                      </a>
                      {resource.checkout && (
                        <p className="break-all text-xs">
                          {resource.checkout.type === "branch"
                            ? resource.checkout.name
                            : resource.checkout.sha}
                        </p>
                      )}
                    </>
                  )}
                  {resource.type !== "memory_store" && resource.mount_path && (
                    <code className="block break-all text-xs">
                      {resource.mount_path}
                    </code>
                  )}
                </div>
              ))}
              {!deployment.resources.length && (
                <p className="text-sm text-muted-foreground">
                  No resources configured.
                </p>
              )}
            </section>
          </>
        )}
      </div>
      <div
        className="flex justify-end gap-1 border-t pt-2"
        role="group"
        aria-label="Pane view"
      >
        <Button
          size="sm"
          variant={api ? "ghost" : "secondary"}
          aria-pressed={!api}
          onClick={() => setApi(false)}
        >
          Rendered
        </Button>
        <Button
          size="sm"
          variant={api ? "secondary" : "ghost"}
          aria-pressed={api}
          onClick={() => setApi(true)}
        >
          API
        </Button>
      </div>
    </div>
  );
}
