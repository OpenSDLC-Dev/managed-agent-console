"use client";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "./data-table";
import { IdCell } from "./copy-id";
import { Pager } from "./pager";
import { EmptyState, ErrorState, StatusBadge, Time } from "./bits";
import { useSessions, useDeployments } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Session, Deployment } from "@/lib/platform/types";

const SESSION_COLUMNS: Column<Session>[] = [
  { key: "id", header: "ID", cell: (row) => <IdCell id={row.id} /> },
  {
    key: "title",
    header: "Name",
    className: "w-full",
    cell: (row) => row.title || "Untitled",
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "version",
    header: "Agent version",
    cell: (row) => (
      <span data-agent-version={row.agent.version}>v{row.agent.version}</span>
    ),
  },
  {
    key: "created",
    header: "Created",
    cell: (row) => <Time iso={row.created_at} />,
  },
];
const DEPLOYMENT_COLUMNS: Column<Deployment>[] = [
  { key: "id", header: "ID", cell: (row) => <IdCell id={row.id} /> },
  { key: "name", header: "Name", className: "w-full", cell: (row) => row.name },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <StatusBadge status={row.archived_at ? "archived" : row.status} />
    ),
  },
  {
    key: "version",
    header: "Agent version",
    cell: (row) => (
      <span data-agent-version={row.agent.version}>v{row.agent.version}</span>
    ),
  },
  {
    key: "created",
    header: "Created",
    cell: (row) => <Time iso={row.created_at} />,
  },
];

export function AgentSessions({
  id,
  version,
}: {
  id: string;
  version: string | null;
}) {
  const router = useRouter();
  const pager = useCursorPage(id + ":" + version);
  const query = useSessions({
    agent_id: id,
    agent_version: version ?? undefined,
    page: pager.page,
  });
  return (
    <section aria-label="Agent sessions">
      <p className="pb-3 text-sm text-muted-foreground">
        {version
          ? "Sessions for the selected agent version."
          : "Sessions across all agent versions."}
      </p>
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <DataTable
            columns={SESSION_COLUMNS}
            rows={query.data?.data ?? []}
            loading={query.isPending}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push("/sessions/" + row.id)}
            empty={<EmptyState title="No sessions" />}
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
    </section>
  );
}
export function AgentDeployments({ id }: { id: string }) {
  const router = useRouter();
  const pager = useCursorPage(id);
  const query = useDeployments({ agent_id: id, page: pager.page });
  return (
    <section aria-label="Agent deployments">
      <p className="pb-3 text-sm text-muted-foreground">
        Deployments across all agent versions.
      </p>
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <DataTable
            columns={DEPLOYMENT_COLUMNS}
            rows={query.data?.data ?? []}
            loading={query.isPending}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push("/deployments/" + row.id)}
            empty={<EmptyState title="No deployments" />}
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
    </section>
  );
}
