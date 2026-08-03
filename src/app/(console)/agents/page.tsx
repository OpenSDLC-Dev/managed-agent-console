"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  ArchivedBadge,
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import { StatusFilter } from "@/components/console/status-filter";
import { useAgents } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Agent } from "@/lib/platform/types";

const COLUMNS: Column<Agent>[] = [
  { key: "id", header: "ID", cell: (a) => <IdCode id={a.id} /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (a) => (
      <span className="flex items-center gap-2">
        {a.name} <ArchivedBadge archivedAt={a.archived_at} />
      </span>
    ),
  },
  {
    key: "model",
    header: "Model",
    cell: (a) => <span className="font-mono text-[13px]">{a.model.id}</span>,
  },
  { key: "version", header: "Version", cell: (a) => `v${a.version}` },
  {
    key: "created",
    header: "Created",
    cell: (a) => <Time iso={a.created_at} />,
  },
  {
    key: "updated",
    header: "Last updated",
    cell: (a) => <Time iso={a.updated_at} />,
  },
];

export default function AgentsPage() {
  const router = useRouter();
  const [includeArchived, setIncludeArchived] = useState(false);
  const pager = useCursorPage(String(includeArchived));
  const { data, error, isPending } = useAgents({
    page: pager.page,
    include_archived: includeArchived || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Create and manage autonomous agents."
        actions={
          <Button className="h-8" onClick={() => router.push("/agents/new")}>
            <Plus className="size-4" /> Create agent
          </Button>
        }
      />
      <div className="flex items-center gap-2 pb-4">
        <StatusFilter
          includeArchived={includeArchived}
          onChange={setIncludeArchived}
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
                action={
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => router.push("/agents/new")}
                  >
                    Create agent
                  </Button>
                }
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
