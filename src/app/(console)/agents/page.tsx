"use client";

import { useRef, Suspense, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useListFilters } from "@/lib/use-list-filters";
import {
  decodeCreatedFilter,
  encodeCreatedFilter,
} from "@/components/console/created-filter-state";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  Day,
  EmptyState,
  ErrorState,
  ResourceStatus,
  UnavailableSurface,
} from "@/components/console/bits";
import { IdCell } from "@/components/console/copy-id";
import {
  AgentInspector,
  AgentActions,
} from "@/components/console/agent-inspector";
import { CreateAgentButton } from "@/components/console/create-agent-dialog";
import { StatusFilter } from "@/components/console/status-filter";
import { CreatedFilter } from "@/components/console/created-filter";
import { useAgents } from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Agent } from "@/lib/platform/types";

const COLUMNS: Column<Agent>[] = [
  { key: "id", header: "ID", cell: (a) => <IdCell id={a.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (a) => a.name,
  },
  {
    key: "model",
    header: "Model",
    cell: (a) => <span className="font-mono text-[13px]">{a.model.id}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: (a) => <ResourceStatus archivedAt={a.archived_at} />,
  },
  {
    key: "created",
    header: "Created",
    cell: (a) => <Day iso={a.created_at} />,
  },
  {
    key: "updated",
    header: "Last updated",
    cell: (a) => <Day iso={a.updated_at} />,
  },
  {
    key: "actions",
    header: "Actions",
    cell: (a) => <AgentActions agent={a} />,
  },
];

export default function AgentsPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading filters…</p>}
    >
      <AgentsList />
    </Suspense>
  );
}

function AgentsList() {
  const filters = useListFilters();
  const lookup = useRef<HTMLInputElement>(null);
  const includeArchived = filters.params.get("status") === "all";
  const createdKey = filters.params.get("created");
  const created = useMemo(() => decodeCreatedFilter(createdKey), [createdKey]);
  const pager = useCursorPage(
    `${includeArchived}|${created.key}|${created.gte}|${created.lte}`,
  );
  const { data, error, isPending } = useAgents({
    page: pager.page,
    include_archived: includeArchived || undefined,
    "created_at[gte]": created.gte,
    "created_at[lte]": created.lte,
  });

  const inspected = filters.params.get("agent");
  const rows = data?.data ?? [];
  const index = rows.findIndex((agent) => agent.id === inspected);
  const inspect = (id: string) => filters.update({ agent: id });

  const filtered = includeArchived || created.key !== "all";
  const resetFilters = () => filters.update({ status: null, created: null });

  if (isUnimplemented(error)) return <UnavailableSurface surface="agents" />;

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle={SURFACES.agents.blurb}
        actions={<CreateAgentButton />}
      />
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = lookup.current?.value.trim();
            if (id) inspect(id);
          }}
        >
          <Input
            ref={lookup}
            aria-label="Find agent by ID"
            placeholder="Find agent by ID"
            className="h-8 w-56"
          />
          <Button type="submit" variant="outline" size="sm">
            Open
          </Button>
        </form>
        <CreatedFilter
          value={created.key}
          range={created.range}
          onChange={(key, range) =>
            filters.update({ created: encodeCreatedFilter(key, range) })
          }
        />
        <StatusFilter
          includeArchived={includeArchived}
          onChange={(value) => filters.update({ status: value ? "all" : null })}
        />
        {filtered && (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>
      {inspected && (
        <AgentInspector
          id={inspected}
          previous={index > 0 ? rows[index - 1]?.id : undefined}
          next={index >= 0 ? rows[index + 1]?.id : undefined}
          onSelect={inspect}
          onClose={() => filters.update({ agent: null })}
          fallbackFocus={lookup}
        />
      )}
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={data?.data ?? []}
            rowKey={(a) => a.id}
            loading={isPending}
            activeRowKey={inspected ?? undefined}
            onRowClick={(a) => inspect(a.id)}
            empty={
              filtered ? (
                <EmptyState
                  title="No matching agents"
                  hint="No agents match the current filters."
                  action={
                    <Button variant="outline" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No agents yet"
                  hint="Create your first agent to get started."
                  action={<CreateAgentButton variant="outline" />}
                />
              )
            }
          />
          <Pager
            hasPrev={pager.hasPrev}
            hasNext={!!data?.next_page}
            onPrev={pager.goPrev}
            onNext={() => data?.next_page && pager.goNext(data.next_page)}
          />
        </>
      )}
    </div>
  );
}
