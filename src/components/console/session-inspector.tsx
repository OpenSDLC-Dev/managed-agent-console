"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceInspector } from "./resource-inspector";
import { SessionActions } from "./session-actions";
import {
  ArchivedBadge,
  DetailSkeleton,
  ErrorState,
  IdCode,
  ListSkeleton,
  StatusBadge,
  Time,
} from "./bits";
import { Field, JsonBlock } from "./detail";
import {
  useEnvironment,
  useRecentSessionEvents,
  useSession,
  useVault,
} from "@/lib/platform/queries";
import { summaryOf } from "@/lib/session-trace/summary";
import { tokenAttr, tokenCount } from "@/lib/utils";
import type { DeploymentRun } from "@/lib/platform/types";
import {
  DeploymentRunDetails,
  deploymentRunSessionHref,
} from "./deployment-run-details";

export function SessionInspector(
  props: Omit<ComponentProps<typeof ResourceInspector>, "kind" | "children">,
) {
  return (
    <ResourceInspector {...props} kind="session">
      <SessionSummary key={props.id} id={props.id} onDeleted={props.onClose} />
    </ResourceInspector>
  );
}

function EnvironmentLink({ id }: { id: string }) {
  const query = useEnvironment(id);
  return (
    <Link
      className="hover:underline"
      href={"/environments/" + encodeURIComponent(id)}
    >
      {query.data?.name ?? <IdCode id={id} />}
    </Link>
  );
}

function VaultLink({ id }: { id: string }) {
  const query = useVault(id);
  return (
    <Link
      className="block hover:underline"
      href={"/vaults/" + encodeURIComponent(id)}
    >
      {query.data?.display_name ?? <IdCode id={id} />}
    </Link>
  );
}

export function SessionSummary({
  id,
  onDeleted,
  run,
}: {
  id: string;
  onDeleted: () => void;
  run?: DeploymentRun;
}) {
  const query = useSession(id, 5000);
  const recent = useRecentSessionEvents(id);
  const [api, setApi] = useState(false);
  if (query.error && !query.data)
    return (
      <div className="space-y-4 overflow-y-auto">
        {run && <DeploymentRunDetails run={run} includeApi />}
        <ErrorState error={query.error} />
      </div>
    );
  if (!query.data) return <DetailSkeleton />;
  const session = query.data;
  const href = run
    ? deploymentRunSessionHref(run)
    : "/sessions/" + encodeURIComponent(session.id);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <h2
          className="min-w-0 flex-1 truncate font-medium"
          title={session.title || "Untitled"}
        >
          {session.title || "Untitled"}
        </h2>
        <Button size="sm" variant="outline" render={<Link href={href} />}>
          Open <ArrowRight className="size-3.5" />
        </Button>
        <SessionActions session={session} onDeleted={onDeleted} compact />
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
        {query.error && <ErrorState error={query.error} />}
        {api ? (
          <>
            {run && (
              <section>
                <h3 className="mb-2 break-all font-mono text-xs">
                  GET /v1/deployment_runs/{run.id}
                </h3>
                <JsonBlock value={run} />
              </section>
            )}
            <section>
              <h3 className="mb-2 break-all font-mono text-xs">
                GET /v1/sessions/{session.id}
              </h3>
              <JsonBlock value={session} />
            </section>
            <section>
              <h3 className="mb-2 break-all font-mono text-xs">
                GET /v1/sessions/{session.id}/events?order=desc&amp;limit=40
              </h3>
              {recent.error && <ErrorState error={recent.error} />}
              {recent.data && <JsonBlock value={recent.data} />}
              {recent.isPending && <ListSkeleton />}
            </section>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-sm">
              <Field label="Status">
                <StatusBadge status={session.status} />{" "}
                <ArchivedBadge archivedAt={session.archived_at} />
              </Field>
              <Field label="Agent">
                <Link
                  className="hover:underline"
                  href={
                    "/agents/" +
                    encodeURIComponent(session.agent.id) +
                    "?version=" +
                    session.agent.version
                  }
                >
                  {session.agent.name} ·{" "}
                  <span data-agent-version={session.agent.version}>
                    v{session.agent.version}
                  </span>
                </Link>
              </Field>
              <Field label="Environment">
                <EnvironmentLink id={session.environment_id} />
              </Field>
              <Field label="Created">
                <Time iso={session.created_at} />
              </Field>
              <Field label="Last activity">
                <Time iso={session.updated_at} />
              </Field>
              {/* renderSession emits zero-only stats and no cost; keep those placeholders in API view. */}
              <Field label="Tokens">
                <span
                  data-input-tokens={tokenAttr(session.usage.input_tokens)}
                  data-output-tokens={tokenAttr(session.usage.output_tokens)}
                >
                  {tokenCount(session.usage.input_tokens)} /{" "}
                  {tokenCount(session.usage.output_tokens)}
                </span>
              </Field>
              <Field label="Resources">
                {session.resources.length ? (
                  <ul className="space-y-2">
                    {session.resources.map((resource) => (
                      <li
                        key={
                          resource.type === "memory_store"
                            ? resource.memory_store_id
                            : resource.id
                        }
                        data-resource-type={resource.type}
                      >
                        {resource.type === "memory_store" ? (
                          <Link
                            className="hover:underline"
                            href={
                              "/memory-stores/" +
                              encodeURIComponent(resource.memory_store_id)
                            }
                          >
                            {resource.name}
                          </Link>
                        ) : resource.type === "github_repository" ? (
                          <span className="break-all">{resource.url}</span>
                        ) : (
                          <IdCode id={resource.file_id} />
                        )}
                        <div className="break-all font-mono text-xs text-muted-foreground">
                          {resource.mount_path}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Vaults">
                {session.vault_ids.length
                  ? session.vault_ids.map((vault) => (
                      <VaultLink key={vault} id={vault} />
                    ))
                  : "—"}
              </Field>
              {session.deployment_id && (
                <Field label="Deployment">
                  <Link
                    className="hover:underline"
                    href={
                      "/deployments/" +
                      encodeURIComponent(session.deployment_id)
                    }
                  >
                    <IdCode id={session.deployment_id} />
                  </Link>
                </Field>
              )}
            </dl>
            {run && <DeploymentRunDetails run={run} />}
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Latest activity</h3>
                <Link
                  className="inline-flex items-center gap-1 text-xs hover:underline"
                  href={href}
                >
                  View events <ArrowRight className="size-3.5" />
                </Link>
              </div>
              {recent.error && <ErrorState error={recent.error} />}
              {recent.isPending ? (
                <ListSkeleton />
              ) : recent.data?.data.length ? (
                <ol className="divide-y">
                  {recent.data.data.map((event) => (
                    <li
                      key={event.id}
                      data-event-id={event.id}
                      className="py-2"
                    >
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <code>{event.type}</code>
                        {event.processed_at && (
                          <Time iso={event.processed_at} />
                        )}
                      </div>
                      <p className="break-words pt-1 text-sm">
                        {summaryOf(event)}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                !recent.error && (
                  <p className="text-sm text-muted-foreground">
                    No events yet.
                  </p>
                )
              )}
            </section>
          </>
        )}
      </div>
      <div className="flex justify-end gap-1 pt-2">
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
