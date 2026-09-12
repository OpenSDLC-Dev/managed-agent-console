"use client";

import { Button } from "@/components/ui/button";

import { Suspense, useRef } from "react";
import Link from "next/link";
import { DeploymentInspector } from "@/components/console/deployment-inspector";
import { ExactResourceLookup } from "@/components/console/exact-resource-lookup";
import { useListFilters } from "@/lib/use-list-filters";
import { PageHeader } from "@/components/shell/page-header";
import { CreateDeploymentButton } from "@/components/console/create-deployment-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import { IdCell } from "@/components/console/copy-id";
import {
  Day,
  EmptyState,
  ErrorState,
  StatusBadge,
  UnavailableSurface,
} from "@/components/console/bits";
import { ResourceActions } from "@/components/console/resource-actions";
import {
  useArchiveDeployment,
  useDeployments,
  useAgentOptions,
} from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Deployment } from "@/lib/platform/types";

function RowActions({ deployment }: { deployment: Deployment }) {
  const archive = useArchiveDeployment(deployment.id);
  return (
    <ResourceActions
      resource="deployment"
      archived={!!deployment.archived_at}
      onArchive={deployment.archived_at ? undefined : () => archive.mutate()}
      archivePending={archive.isPending}
    />
  );
}

const COLUMNS: Column<Deployment>[] = [
  { key: "id", header: "ID", cell: (row) => <IdCell id={row.id} /> },
  { key: "name", header: "Name", className: "w-full", cell: (row) => row.name },
  {
    key: "status",
    header: "Status",
    cell: (row) =>
      row.archived_at ? (
        <span data-status="archived">Archived</span>
      ) : (
        <span data-status={row.status}>
          <StatusBadge status={row.status} />
        </span>
      ),
  },
  {
    key: "agent",
    header: "Agent",
    cell: (row) => (
      <span className="font-mono text-[13px]">
        {row.agent.id} · v{row.agent.version}
      </span>
    ),
  },
  {
    key: "schedule",
    header: "Trigger",
    cell: (row) =>
      row.schedule ? (
        <span className="font-mono text-[13px]">{row.schedule.expression}</span>
      ) : (
        "Manual"
      ),
  },
  {
    key: "created",
    header: "Created",
    cell: (row) => <Day iso={row.created_at} />,
  },
  {
    key: "actions",
    header: "Actions",
    cell: (row) => (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => event.stopPropagation()}
          render={<Link href={`/deployments/${encodeURIComponent(row.id)}`} />}
        >
          Open
        </Button>
        <RowActions deployment={row} />
      </div>
    ),
  },
];

type View = "live" | "active" | "paused" | "archived";

export default function DeploymentsPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading filters…</p>}
    >
      <DeploymentsList />
    </Suspense>
  );
}

function DeploymentsList() {
  const filters = useListFilters();
  const lookup = useRef<HTMLInputElement>(null);
  const inspected = filters.params.get("deployment");
  const inspect = (id: string) => filters.update({ deployment: id });
  const closeInspector = () => filters.update({ deployment: null });
  const status = filters.params.get("status");
  const view: View =
    status === "active" || status === "paused" || status === "archived"
      ? status
      : "live";
  const agentId = filters.params.get("agent") || "all";
  const agents = useAgentOptions();
  const pager = useCursorPage(view + "|" + agentId);
  const query = useDeployments({
    page: pager.page,
    agent_id: agentId === "all" ? undefined : agentId,
    ...(view === "archived" ? { include_archived: true } : {}),
    ...(view === "active" || view === "paused" ? { status: view } : {}),
  });

  const filtered = view !== "live" || agentId !== "all";
  const rows = query.data?.data ?? [];
  const inspectedIndex = rows.findIndex((row) => row.id === inspected);
  const resetFilters = () => filters.update({ status: null, agent: null });

  if (isUnimplemented(query.error))
    return <UnavailableSurface surface="deployments" />;

  return (
    <div>
      <PageHeader
        title="Deployments"
        className="flex-wrap"
        subtitle={SURFACES.deployments.blurb}
        actions={<CreateDeploymentButton />}
      />
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <ExactResourceLookup
          resource="deployment"
          path="/deployments"
          onOpen={inspect}
          inputRef={lookup}
        />
        <Select
          value={agentId}
          onValueChange={(value) =>
            filters.update({ agent: value && value !== "all" ? value : null })
          }
        >
          <SelectTrigger aria-label="Agent filter" className="h-8 max-w-full">
            <SelectValue>
              {agentId === "all"
                ? "All agents"
                : agents.data?.agents.find((agent) => agent.id === agentId)
                    ?.name || agentId}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {(agents.data?.agents ?? []).map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name || agent.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {agents.isError && (
          <span className="text-xs text-muted-foreground">
            Agent options could not be loaded.
          </span>
        )}
        {agents.data?.truncated && (
          <span className="text-xs text-muted-foreground">
            Showing the first 1,000 agents.
          </span>
        )}
        <Select
          value={view}
          onValueChange={(value) =>
            filters.update({ status: value && value !== "live" ? value : null })
          }
        >
          <SelectTrigger aria-label="Deployment status" className="h-8 w-44">
            <SelectValue>
              {
                {
                  live: "All live",
                  active: "Active",
                  paused: "Paused",
                  archived: "Include archived",
                }[view]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">All live</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="archived">Include archived</SelectItem>
          </SelectContent>
        </Select>
        {filtered && (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>
      {inspected && (
        <DeploymentInspector
          id={inspected}
          previous={
            inspectedIndex > 0 ? rows[inspectedIndex - 1]?.id : undefined
          }
          next={inspectedIndex >= 0 ? rows[inspectedIndex + 1]?.id : undefined}
          onSelect={inspect}
          onClose={closeInspector}
          fallbackFocus={lookup}
        />
      )}
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={query.data?.data ?? []}
            rowKey={(row) => row.id}
            loading={query.isPending}
            activeRowKey={inspected ?? undefined}
            onRowClick={(row) => inspect(row.id)}
            empty={
              filtered ? (
                <EmptyState
                  title="No matching deployments"
                  hint="No deployments match the current filters."
                  action={
                    <Button variant="outline" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No deployments yet"
                  hint="Create a deployment to run an agent manually or on a schedule."
                />
              )
            }
          />
          <Pager
            hasPrev={pager.hasPrev}
            hasNext={!!query.data?.next_page}
            onPrev={pager.goPrev}
            onNext={() =>
              query.data?.next_page && pager.goNext(query.data.next_page)
            }
          />
        </>
      )}
    </div>
  );
}
