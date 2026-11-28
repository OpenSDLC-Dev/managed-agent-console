"use client";

import { surfacePaths } from "@/lib/routes";
import { Input } from "@/components/ui/input";
import { ResourceSelectionActions } from "@/components/console/resource-selection-actions";
import { PlatformError } from "@/lib/platform/http";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/shell/workspace-navigation";
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
import { CopyIdButton } from "@/components/console/copy-id";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  ArchivedBadge,
  EmptyState,
  ErrorState,
  IdCode,
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
  useSession,
} from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { SessionTokenSummary } from "@/components/console/session-metrics";
import type { Session, SessionStatus } from "@/lib/platform/types";

const COLUMNS: Column<Session>[] = [
  {
    key: "id",
    header: "ID",
    cell: (s) => (
      <span
        className="inline-flex items-center gap-1"
        data-testid="id-cell"
        data-id={s.id}
      >
        <Link
          href={`${surfacePaths.sessions}/${encodeURIComponent(s.id)}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline"
        >
          <IdCode id={s.id} />
        </Link>
        <CopyIdButton id={s.id} />
      </span>
    ),
  },
  {
    key: "title",
    header: "Name",
    className: "w-full",
    cell: (s) => (
      <span className="flex items-center gap-2">
        <Link
          href={`${surfacePaths.sessions}/${encodeURIComponent(s.id)}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline"
        >
          {s.title || "Untitled"}
        </Link>
        <StatusBadge status={s.status} />
        <ArchivedBadge archivedAt={s.archived_at} />
      </span>
    ),
  },
  {
    key: "agent",
    header: "Agent",
    cell: (s) => (
      <Link
        href={`${surfacePaths.agents}/${encodeURIComponent(s.agent.id)}?version=${s.agent.version}`}
        onClick={(e) => e.stopPropagation()}
        className="whitespace-nowrap rounded-md bg-secondary px-2 py-1 text-xs hover:underline"
      >
        {s.agent.name} · v{s.agent.version}
      </Link>
    ),
  },
  {
    key: "tokens",
    header: "Tokens in / out",
    cell: (s) => <SessionTokenSummary usage={s.usage} compact />,
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

function encodeStatuses(values: SessionStatus[]) {
  if (values.length === STATUS_OPTIONS.length) return "all";
  if (!values.length || (values.length === 3 && !values.includes("terminated")))
    return null;
  return STATUS_OPTIONS.filter((status) => values.includes(status)).join(",");
}

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
  const rawId = filters.params.get("id") ?? "";
  const id = rawId.trim();
  const validId = /^[a-zA-Z0-9_-]+$/.test(id);
  const [settledId, setSettledId] = useState(id);
  useEffect(() => {
    if (id === settledId) return;
    const timer = setTimeout(() => setSettledId(id), 220);
    return () => clearTimeout(timer);
  }, [id, settledId]);
  const lookupSession = useSession(
    settledId,
    undefined,
    validId && id === settledId,
  );
  const inspected = filters.params.get("session");
  const inspect = (id: string) => filters.update({ session: id });
  const closeInspector = () => filters.update({ session: null });
  const page = filters.params.get("page") || undefined;
  const rawStatuses = (filters.params.get("status") ?? "").split(",");
  const selectedStatuses =
    rawStatuses.length === 1 && rawStatuses[0] === "all"
      ? STATUS_OPTIONS
      : STATUS_OPTIONS.filter((status) => rawStatuses.includes(status));
  const statuses: SessionStatus[] = selectedStatuses.length
    ? selectedStatuses
    : ["running", "idle", "rescheduling"];
  const order = filters.params.get("order") === "asc" ? "asc" : "desc";
  function changeFilters(changes: Record<string, string | null>) {
    if (
      Object.entries(changes).some(
        ([name, value]) => effectiveFilters[name] !== value,
      )
    ) {
      filters.update({ ...changes, page: null, id: null });
    }
  }
  function setStatuses(values: SessionStatus[]) {
    changeFilters({ status: encodeStatuses(values) });
  }
  function setOrder(value: "asc" | "desc") {
    changeFilters({ order: value === "desc" ? null : value });
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
    changeFilters({ deployment: value === "all" ? null : value });
  }
  const deployments = useDeploymentOptions();
  const agentId = filters.params.get("agent") || "all";
  function setAgentId(value: string) {
    changeFilters({ agent: value === "all" ? null : value });
  }
  // The gte freezes at selection time so the query key stays stable.
  const createdKey = filters.params.get("created");
  const created = useMemo(() => decodeCreatedFilter(createdKey), [createdKey]);
  const effectiveFilters: Record<string, string | null> = {
    id: rawId || null,
    created: encodeCreatedFilter(created.key, created.range),
    status: encodeStatuses(statuses),
    agent: agentId === "all" ? null : agentId,
    deployment: deploymentId === "all" ? null : deploymentId,
    order: order === "desc" ? null : order,
  };
  const agentOptions = useAgentOptions();
  const list = useSessions(
    {
      page,
      deployment_id: deploymentId === "all" ? undefined : deploymentId,
      statuses,
      include_archived: statuses.includes("terminated") || undefined,
      order,
      agent_id: agentId === "all" ? undefined : agentId,
      "created_at[gte]": created.gte,
      "created_at[lte]": created.lte,
    },
    !id,
  );
  const { data, isPlaceholderData } = list;
  const missing =
    lookupSession.error instanceof PlatformError &&
    lookupSession.error.status === 404;
  const error = id
    ? validId && id === settledId && !missing
      ? lookupSession.error
      : null
    : list.error;
  const isPending = id
    ? validId && (id !== settledId || lookupSession.isPending)
    : list.isPending;

  const filtered =
    !!id ||
    deploymentId !== "all" ||
    agentId !== "all" ||
    created.key !== "all" ||
    statuses.length !== 3 ||
    statuses.includes("terminated");
  const rows = id
    ? validId && id === settledId && lookupSession.data && !error && !missing
      ? [lookupSession.data]
      : []
    : (data?.data ?? []);
  const scopeParams = new URLSearchParams(filters.params);
  scopeParams.delete("session");
  const scope = scopeParams.toString();
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope,
    ids: [],
  });
  if (selection.scope !== scope) setSelection({ scope, ids: [] });
  const ids = selection.scope === scope ? selection.ids : [];
  const selected = rows.filter((row) => ids.includes(row.id));
  const select = (ids: string[]) => setSelection({ scope, ids });
  const stale = !id && isPlaceholderData;
  const inspectedIndex = rows.findIndex((row) => row.id === inspected);
  const columns: Column<Session>[] = [
    {
      key: "selection",
      header: (
        <input
          type="checkbox"
          aria-label="Select all rows"
          disabled={stale || !rows.length}
          checked={!!rows.length && selected.length === rows.length}
          ref={(el) => {
            if (el)
              el.indeterminate =
                selected.length > 0 && selected.length < rows.length;
          }}
          onChange={(e) =>
            select(e.target.checked ? rows.map((s) => s.id) : [])
          }
        />
      ),
      cell: (s) => (
        <input
          type="checkbox"
          aria-label={"Select " + s.id}
          disabled={stale}
          checked={ids.includes(s.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            select(
              e.target.checked
                ? [...ids, s.id]
                : ids.filter((id) => id !== s.id),
            )
          }
        />
      ),
    },
    ...COLUMNS,
    {
      key: "actions",
      header: "Actions",
      cell: (session) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              inspect(session.id);
            }}
          >
            Quickview
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
    changeFilters({
      id: null,
      deployment: null,
      agent: null,
      created: null,
      status: null,
      order: null,
    });
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
        <Input
          ref={lookup}
          aria-label="Find session by ID"
          placeholder="Session ID"
          value={rawId}
          className="h-8 w-52 min-w-0"
          onChange={(e) => {
            const value = e.currentTarget.value;
            filters.update(
              { id: value || null, session: null, page: null },
              rawId && value ? "replace" : "push",
            );
          }}
        />
        <CreatedFilter
          value={created.key}
          range={created.range}
          sessionPresets
          onChange={(key, range) => {
            changeFilters({ created: encodeCreatedFilter(key, range) });
          }}
        />

        <div className="flex items-center gap-1.5">
          <Select
            value={agentId}
            onValueChange={(value) => {
              setAgentId(value ?? "all");
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-lg border-transparent bg-secondary shadow-none"
              aria-label="Agent filter"
              data-value={agentId}
            >
              <span
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
              >
                Agent
              </span>
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
          <Select
            value={deploymentId}
            onValueChange={(value) => {
              setDeploymentId(value ?? "all");
            }}
          >
            <SelectTrigger
              aria-label="Deployment filter"
              className="h-8 min-w-0 max-w-64 border-transparent bg-secondary shadow-none"
            >
              <span
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
              >
                Deployment
              </span>
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
          <Select
            multiple
            value={statuses}
            onValueChange={(value) => {
              setStatuses(
                value.length
                  ? (value as SessionStatus[])
                  : ["running", "idle", "rescheduling"],
              );
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-lg border-transparent bg-secondary shadow-none"
              aria-label="Status filter"
              data-value={statuses.join(",")}
            >
              <span
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
              >
                Status
              </span>
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
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={resetFilters}
          >
            Reset
          </Button>
        )}
      </div>
      <div data-selected-count={selected.length}>
        <ResourceSelectionActions
          resource="session"
          selected={selected}
          clear={() => select([])}
          onComplete={(succeeded, action) => {
            setSelection((current) => ({
              ...current,
              ids: current.ids.filter((id) => !succeeded.includes(id)),
            }));
            const open = new URLSearchParams(window.location.search).get(
              "session",
            );
            if (action === "delete" && open && succeeded.includes(open))
              closeInspector();
          }}
        />
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
                        }}
                      >
                        Created{" "}
                        <span aria-hidden>{order === "desc" ? "↓" : "↑"}</span>
                      </button>
                    ),
                  }
                : column,
            )}
            rows={rows}
            rowKey={(s) => s.id}
            loading={isPending}
            activeRowKey={inspected ?? undefined}
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
          {!id && (
            <Pager
              hasPrev={!isPlaceholderData && !!data?.prev_page}
              hasNext={!isPlaceholderData && !!data?.next_page}
              onPrev={() =>
                data?.prev_page && filters.update({ page: data.prev_page })
              }
              onNext={() =>
                data?.next_page && filters.update({ page: data.next_page })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
