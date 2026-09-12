"use client";

import { ExactResourceLookup } from "@/components/console/exact-resource-lookup";
import { useState, Suspense, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SessionInspector } from "@/components/console/session-inspector";
import { SessionActions } from "@/components/console/session-actions";
import { useListFilters } from "@/lib/use-list-filters";
import {
  decodeCreatedFilter,
  encodeCreatedFilter,
} from "@/components/console/created-filter-state";
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
import { CreatedFilter } from "@/components/console/created-filter";
import {
  useAgentOptions,
  useDeploymentOptions,
  useSessions,
} from "@/lib/platform/queries";
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

const STATUS_OPTIONS: SessionStatus[] = [
  "running",
  "idle",
  "rescheduling",
  "terminated",
];

export default function SessionsPage() {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading filters…</p>}
    >
      <SessionsList />
    </Suspense>
  );
}

function SessionsList() {
  const filters = useListFilters();
  const lookup = useRef<HTMLInputElement>(null);
  const inspected = filters.params.get("session");
  const inspect = (id: string) => filters.update({ session: id });
  const closeInspector = () => filters.update({ session: null });
  const pageParams = new URLSearchParams(filters.params);
  pageParams.delete("session");
  const cursorKey = pageParams.toString();
  const selectedStatuses = (filters.params.get("status") ?? "")
    .split(",")
    .filter((status): status is SessionStatus =>
      STATUS_OPTIONS.includes(status as SessionStatus),
    );
  const statuses: SessionStatus[] = selectedStatuses.length
    ? [...new Set(selectedStatuses)]
    : ["running", "idle", "rescheduling"];
  const order = filters.params.get("order") === "asc" ? "asc" : "desc";
  function setStatuses(values: SessionStatus[]) {
    const active = values.length === 3 && !values.includes("terminated");
    filters.update({
      status: !values.length || active ? null : values.join(","),
    });
  }
  function setOrder(value: "asc" | "desc") {
    filters.update({ order: value === "desc" ? null : value });
  }
  const statusLabel =
    statuses.length === 4
      ? "All"
      : statuses.length === 3 && !statuses.includes("terminated")
        ? "Active"
        : statuses
            .map((status) => status[0].toUpperCase() + status.slice(1))
            .join(", ");
  const deploymentId = filters.params.get("deployment") || "all";
  function setDeploymentId(value: string) {
    filters.update({ deployment: value === "all" ? null : value });
  }
  const deployments = useDeploymentOptions();
  const agentId = filters.params.get("agent") || "all";
  function setAgentId(value: string) {
    filters.update({ agent: value === "all" ? null : value });
  }
  // The gte freezes at selection time so the query key stays stable.
  const createdKey = filters.params.get("created");
  const created = useMemo(() => decodeCreatedFilter(createdKey), [createdKey]);
  // Sessions are the one bidirectional list: the wire supplies both cursors.
  const [cursor, setCursor] = useState<{ key: string; page?: string }>({
    key: cursorKey,
  });
  const page = cursor.key === cursorKey ? cursor.page : undefined;
  if (cursor.key !== cursorKey) setCursor({ key: cursorKey });
  function setPage(page: string | undefined) {
    setCursor({ key: cursorKey, page });
  }
  const agentOptions = useAgentOptions();
  const { data, error, isPending } = useSessions({
    page,
    deployment_id: deploymentId === "all" ? undefined : deploymentId,
    statuses,
    order,
    agent_id: agentId === "all" ? undefined : agentId,
    "created_at[gte]": created.gte,
    "created_at[lte]": created.lte,
  });

  const filtered =
    deploymentId !== "all" ||
    agentId !== "all" ||
    created.key !== "all" ||
    statuses.length !== 3 ||
    statuses.includes("terminated");
  const rows = data?.data ?? [];
  const inspectedIndex = rows.findIndex((row) => row.id === inspected);
  const columns: Column<Session>[] = [
    ...COLUMNS,
    {
      key: "actions",
      header: "Actions",
      cell: (session) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            render={
              <Link href={"/sessions/" + encodeURIComponent(session.id)} />
            }
          >
            Open
          </Button>
          <SessionActions
            session={session}
            compact
            onDeleted={() => {
              if (inspected === session.id) closeInspector();
            }}
          />
        </div>
      ),
    },
  ];
  function resetFilters() {
    filters.update({
      deployment: null,
      agent: null,
      created: null,
      status: null,
      order: null,
    });
    setPage(undefined);
  }

  if (isUnimplemented(error)) return <UnavailableSurface surface="sessions" />;

  return (
    <div>
      <PageHeader
        title="Sessions"
        className="flex-wrap"
        subtitle={SURFACES.sessions.blurb}
        actions={<CreateSessionButton />}
      />
      <div className="flex flex-wrap items-center gap-3 pb-4 text-sm">
        <ExactResourceLookup
          resource="session"
          path="/sessions"
          onOpen={inspect}
          inputRef={lookup}
        />
        <CreatedFilter
          value={created.key}
          range={created.range}
          sessionPresets
          onChange={(key, range) => {
            filters.update({ created: encodeCreatedFilter(key, range) });
            setPage(undefined);
          }}
        />

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
              <SelectValue>
                {agentId === "all"
                  ? "All"
                  : agentOptions.data?.agents.find(
                      (agent) => agent.id === agentId,
                    )?.name || agentId}
              </SelectValue>
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
        <div className="flex min-w-0 max-w-full items-center gap-1.5">
          <span className="text-muted-foreground">Deployment</span>
          <Select
            value={deploymentId}
            onValueChange={(value) => {
              setDeploymentId(value ?? "all");
              setPage(undefined);
            }}
          >
            <SelectTrigger
              aria-label="Deployment filter"
              className="h-8 min-w-0 max-w-64"
            >
              <SelectValue>
                {deploymentId === "all"
                  ? "All"
                  : deployments.data?.deployments.find(
                      (item) => item.id === deploymentId,
                    )?.name || deploymentId}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(deployments.data?.deployments ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name || item.id}
                  <ArchivedBadge archivedAt={item.archived_at} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {deployments.isError && (
          <span className="text-xs text-destructive">
            Deployment options failed to load.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void deployments.refetch()}
            >
              Retry
            </button>
          </span>
        )}
        {deployments.data?.truncated && (
          <span className="text-xs text-muted-foreground">
            Showing the first 1,000 deployments.
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Status</span>
          <Select
            multiple
            value={statuses}
            onValueChange={(value) => {
              setStatuses(
                value.length
                  ? (value as SessionStatus[])
                  : ["running", "idle", "rescheduling"],
              );
              setPage(undefined);
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-lg"
              aria-label="Status filter"
              data-value={statuses.join(",")}
            >
              <SelectValue>{statusLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent
              footer={
                filtered &&
                (statuses.length !== 3 || statuses.includes("terminated")) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 w-full border-t"
                    onClick={() => {
                      setStatuses(["running", "idle", "rescheduling"]);
                      setPage(undefined);
                    }}
                  >
                    Clear selection
                  </Button>
                ) : undefined
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(filtered || order !== "desc") && (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>
      {inspected && (
        <SessionInspector
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
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={columns.map((column) =>
              column.key === "created"
                ? {
                    ...column,
                    header: (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        aria-label={
                          "Created: " +
                          (order === "desc" ? "newest first" : "oldest first")
                        }
                        onClick={() => {
                          setOrder(order === "desc" ? "asc" : "desc");
                          setPage(undefined);
                        }}
                      >
                        Created{" "}
                        <span aria-hidden>{order === "desc" ? "↓" : "↑"}</span>
                      </button>
                    ),
                  }
                : column,
            )}
            rows={data?.data ?? []}
            rowKey={(s) => s.id}
            loading={isPending}
            activeRowKey={inspected ?? undefined}
            onRowClick={(s) => inspect(s.id)}
            empty={
              filtered ? (
                <EmptyState
                  title="No matching sessions"
                  hint="No sessions match the current filters."
                  action={
                    <Button variant="outline" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No sessions yet"
                  hint="Create a session to get started."
                  action={<CreateSessionButton variant="outline" />}
                />
              )
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
