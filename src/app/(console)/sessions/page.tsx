"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { CreateSessionButton } from "@/components/console/create-session-dialog";
import { IdCell } from "@/components/console/copy-id";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  ArchivedBadge,
  EmptyState,
  ErrorState,
  StatusBadge,
  Time,
  UnavailableSurface,
} from "@/components/console/bits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreatedFilter,
  createdGte,
  type CreatedPresetKey,
} from "@/components/console/created-filter";
import { useAgentOptions, useSessions } from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { tokenAttr, tokenCount } from "@/lib/utils";
import type { Session, SessionStatus } from "@/lib/platform/types";

const COLUMNS: Column<Session>[] = [
  { key: "id", header: "ID", cell: (s) => <IdCell id={s.id} /> },
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
    cell: (s) => (
      <span
        data-testid="tokens-cell"
        data-input-tokens={tokenAttr(s.usage?.input_tokens)}
        data-output-tokens={tokenAttr(s.usage?.output_tokens)}
      >
        {tokenCount(s.usage?.input_tokens)} /{" "}
        {tokenCount(s.usage?.output_tokens)}
      </span>
    ),
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
  const [agentId, setAgentId] = useState<string>("all");
  // The gte freezes at selection time so the query key stays stable.
  const [created, setCreated] = useState<{
    key: CreatedPresetKey;
    gte?: string;
  }>({ key: "all" });
  // Sessions are the one bidirectional list: the wire supplies both cursors.
  const [page, setPage] = useState<string | undefined>(undefined);
  const agentOptions = useAgentOptions();
  const { data, error, isPending } = useSessions({
    page,
    statuses: status === "all" ? undefined : [status],
    agent_id: agentId === "all" ? undefined : agentId,
    "created_at[gte]": created.gte,
  });

  if (isUnimplemented(error)) return <UnavailableSurface surface="sessions" />;

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle={SURFACES.sessions.blurb}
        actions={<CreateSessionButton />}
      />
      <div className="flex flex-wrap items-center gap-3 pb-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Status</span>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as SessionStatus | "all");
              setPage(undefined);
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-lg"
              aria-label="Status filter"
              data-value={status}
            >
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
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Agent</span>
          <Select
            value={agentId}
            onValueChange={(value) => {
              setAgentId(value ?? "all");
              setPage(undefined);
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-lg"
              aria-label="Agent filter"
              data-value={agentId}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(agentOptions.data?.agents ?? []).map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <span className="flex items-center gap-2">
                    {agent.name}
                    <ArchivedBadge archivedAt={agent.archived_at} />
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agentOptions.error ? (
            // A silent fallback would be indistinguishable from "no agents".
            <span className="text-[12px] text-destructive">
              agent options failed to load{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void agentOptions.refetch()}
              >
                retry
              </button>
            </span>
          ) : agentOptions.data?.truncated ? (
            <span className="text-[12px] text-muted-foreground">
              options truncated at 1000 agents
            </span>
          ) : null}
        </div>
        <CreatedFilter
          value={created.key}
          onChange={(key) => {
            setCreated({ key, gte: createdGte(key) });
            setPage(undefined);
          }}
        />
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
                hint="Create a session to get started."
                action={<CreateSessionButton variant="outline" />}
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
