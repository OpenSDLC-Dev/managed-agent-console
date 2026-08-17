"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ResourceActions } from "@/components/console/resource-actions";
import { CreateAgentButton } from "@/components/console/create-agent-dialog";
import { StatusFilter } from "@/components/console/status-filter";
import {
  CreatedFilter,
  createdGte,
  type CreatedPresetKey,
} from "@/components/console/created-filter";
import { useAgents, useArchiveAgent } from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Agent } from "@/lib/platform/types";

function AgentRowActions({ agent }: { agent: Agent }) {
  const archive = useArchiveAgent(agent.id);
  return (
    <ResourceActions
      resource="agent"
      archived={!!agent.archived_at}
      onArchive={agent.archived_at ? undefined : () => archive.mutate()}
      archivePending={archive.isPending}
    />
  );
}

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
  { key: "version", header: "Version", cell: (a) => `v${a.version}` },
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
    cell: (a) => <AgentRowActions agent={a} />,
  },
];

export default function AgentsPage() {
  const router = useRouter();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [created, setCreated] = useState<{
    key: CreatedPresetKey;
    gte?: string;
  }>({ key: "all" });
  const pager = useCursorPage(`${includeArchived}|${created.key}`);
  const { data, error, isPending } = useAgents({
    page: pager.page,
    include_archived: includeArchived || undefined,
    "created_at[gte]": created.gte,
  });

  if (isUnimplemented(error)) return <UnavailableSurface surface="agents" />;

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle={SURFACES.agents.blurb}
        actions={<CreateAgentButton />}
      />
      <div className="flex items-center gap-3 pb-4">
        <StatusFilter
          includeArchived={includeArchived}
          onChange={setIncludeArchived}
        />
        <CreatedFilter
          value={created.key}
          onChange={(key) => setCreated({ key, gte: createdGte(key) })}
        />
      </div>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={data?.data ?? []}
            rowKey={(a) => a.id}
            loading={isPending}
            onRowClick={(a) => router.push(`/agents/${a.id}`)}
            empty={
              <EmptyState
                title="No agents yet"
                hint="Create your first agent to get started."
                action={<CreateAgentButton variant="outline" />}
              />
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
