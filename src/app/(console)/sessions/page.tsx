"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  ArchivedBadge,
  EmptyState,
  ErrorState,
  IdCode,
  StatusBadge,
  Time,
} from "@/components/console/bits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSessions } from "@/lib/platform/queries";
import type { Session, SessionStatus } from "@/lib/platform/types";

const COLUMNS: Column<Session>[] = [
  { key: "id", header: "ID", cell: (s) => <IdCode id={s.id} /> },
  {
    key: "title",
    header: "Name",
    className: "w-full",
    cell: (s) => (
      <span className="flex items-center gap-2">
        {s.title || <span className="text-muted-foreground">Untitled</span>}
        <ArchivedBadge archivedAt={s.archived_at} />
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (s) => <StatusBadge status={s.status} />,
  },
  {
    key: "agent",
    header: "Agent",
    cell: (s) => `${s.agent.name} · v${s.agent.version}`,
  },
  {
    key: "tokens",
    header: "Tokens in / out",
    cell: (s) =>
      `${s.usage.input_tokens.toLocaleString()} / ${s.usage.output_tokens.toLocaleString()}`,
  },
  {
    key: "created",
    header: "Created",
    cell: (s) => <Time iso={s.created_at} />,
  },
];

const STATUS_OPTIONS: (SessionStatus | "all")[] = [
  "all",
  "idle",
  "running",
  "rescheduling",
  "terminated",
];

export default function SessionsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  // Sessions are the one bidirectional list: the wire supplies both cursors.
  const [page, setPage] = useState<string | undefined>(undefined);
  const { data, error, isPending } = useSessions({
    page,
    statuses: status === "all" ? undefined : [status],
  });

  return (
    <div>
      <PageHeader title="Sessions" subtitle="Trace and debug agent sessions." />
      <div className="flex items-center gap-1.5 pb-4 text-sm">
        <span className="text-muted-foreground">Status</span>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as SessionStatus | "all");
            setPage(undefined);
          }}
        >
          <SelectTrigger size="sm" className="h-8 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "All" : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={data?.data ?? []}
            rowKey={(s) => s.id}
            loading={isPending}
            onRowClick={(s) => router.push(`/sessions/${s.id}`)}
            empty={
              <EmptyState
                title="No sessions yet"
                hint="Sessions will appear here once created through the API."
              />
            }
          />
          <Pager
            hasPrev={!!data?.prev_page}
            hasNext={!!data?.next_page}
            onPrev={() => setPage(data?.prev_page ?? undefined)}
            onNext={() => data?.next_page && setPage(data.next_page)}
          />
        </>
      )}
    </div>
  );
}
