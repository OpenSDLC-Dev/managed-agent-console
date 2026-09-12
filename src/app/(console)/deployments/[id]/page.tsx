"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { DeploymentActions } from "@/components/console/deployment-actions";
import {
  DeploymentEditor,
  formFromDeployment,
} from "@/components/console/deployment-editor";
import { DeploymentRunInspector } from "@/components/console/deployment-run-inspector";
import { deploymentRunSessionHref } from "@/components/console/deployment-run-details";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import { ExactResourceLookup } from "@/components/console/exact-resource-lookup";
import { IdCell } from "@/components/console/copy-id";
import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
  StatusBadge,
  Time,
} from "@/components/console/bits";
import { useDeployment, useDeploymentRuns } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import { useListFilters } from "@/lib/use-list-filters";
import type { Deployment, DeploymentRun } from "@/lib/platform/types";

const RUN_COLUMNS: Column<DeploymentRun>[] = [
  { key: "id", header: "ID", cell: (run) => <IdCell id={run.id} /> },
  {
    key: "created",
    header: "Started at (UTC)",
    cell: (run) => <Time iso={run.created_at} />,
  },
  {
    key: "trigger",
    header: "Trigger",
    cell: (run) => (
      <span data-trigger-type={run.trigger_context.type}>
        {run.trigger_context.type === "manual" ? "Manual" : "Schedule"}
      </span>
    ),
  },
  {
    key: "result",
    header: "Result",
    cell: (run) => (
      <span data-run-result={run.error ? "failed" : "succeeded"}>
        <StatusBadge status={run.error ? "failed" : "succeeded"} />
      </span>
    ),
  },
  {
    key: "agent",
    header: "Agent version",
    cell: (run) => (
      <Link
        className="hover:underline"
        href={`/agents/${encodeURIComponent(run.agent.id)}?version=${run.agent.version}`}
        onClick={(event) => event.stopPropagation()}
      >
        v{run.agent.version}
      </Link>
    ),
  },
  {
    key: "session",
    header: "Session",
    cell: (run) =>
      run.session_id ? (
        <Link
          className="font-mono text-[13px] hover:underline"
          href={deploymentRunSessionHref(run)}
          onClick={(event) => event.stopPropagation()}
        >
          {run.session_id}
        </Link>
      ) : (
        "—"
      ),
  },
];

export default function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = useDeployment(id);
  const filters = useListFilters();
  const tab = filters.params.get("tab") === "runs" ? "runs" : "configuration";
  if (query.error && !query.data) return <ErrorState error={query.error} />;
  if (!query.data) return <DetailSkeleton />;
  const item = query.data;
  return (
    <div className="flex h-[calc(100dvh-48px)] min-h-[480px] min-w-0 flex-col">
      <Breadcrumb
        parent={{ href: "/deployments", label: "Deployments" }}
        current={item.name}
      />
      <PageHeader
        title={item.name}
        subtitle={item.description || undefined}
        className="flex-wrap pb-2"
        actions={
          <DeploymentActions
            deployment={item}
            onRun={(run) =>
              filters.update({
                tab: "runs",
                run: run.id,
                trigger: null,
                result: null,
              })
            }
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <IdCell id={item.id} />
        <span data-status={item.archived_at ? "archived" : item.status}>
          <StatusBadge status={item.archived_at ? "archived" : item.status} />
        </span>
        <span>
          Created <Time iso={item.created_at} />
        </span>
        {item.paused_reason && (
          <span data-paused-reason={item.paused_reason.type}>
            Paused:{" "}
            {item.paused_reason.type === "manual"
              ? "Manual"
              : item.paused_reason.error.type}
          </span>
        )}
      </div>
      {query.error && <ErrorState error={query.error} />}
      <nav aria-label="Deployment views" className="mb-4 flex gap-1 border-b">
        {(["configuration", "runs"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-current={tab === value ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm ${tab === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() =>
              filters.update({
                tab: value === "runs" ? "runs" : null,
                run: null,
              })
            }
          >
            {value === "runs" ? "Runs" : "Configuration"}
          </button>
        ))}
      </nav>
      <div
        className={
          tab === "configuration" ? "flex min-h-0 flex-1 flex-col" : "hidden"
        }
      >
        <DeploymentEditor
          key={id + ":" + !!item.archived_at}
          mode="edit"
          inline
          readOnly={!!item.archived_at}
          initial={formFromDeployment(item)}
          initialResources={item.resources}
          deploymentId={id}
          scheduleDetails={<UpcomingRuns deployment={item} />}
          onSaved={() => toast.success("Saved deployment configuration.")}
        />
      </div>
      {tab === "runs" && <Runs deploymentId={id} />}
    </div>
  );
}

function UpcomingRuns({ deployment }: { deployment: Deployment }) {
  const [all, setAll] = useState(false);
  const schedule = deployment.schedule;
  if (!schedule) return null;
  const upcoming = schedule.upcoming_runs_at ?? [];
  return (
    <div
      data-testid="deployment-schedule"
      className="space-y-2 text-xs text-muted-foreground"
    >
      <p>
        Saved schedule: <code>{schedule.expression}</code> · {schedule.timezone}
      </p>
      <p>
        Next runs (UTC)
        {deployment.status === "paused" && !deployment.archived_at
          ? " · if resumed"
          : ""}
      </p>
      <div
        data-upcoming-count={upcoming.length}
        className="flex flex-wrap items-center gap-2"
      >
        {(all ? upcoming : upcoming.slice(0, 3)).map((at) => (
          <span key={at} className="rounded-md border px-2 py-1">
            <Time iso={at} />
          </span>
        ))}
        {!upcoming.length && "No upcoming runs."}
        {upcoming.length > 3 && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setAll(!all)}
          >
            {all ? "Show less" : `Show ${upcoming.length - 3} more`}
          </Button>
        )}
      </div>
    </div>
  );
}

function Runs({ deploymentId }: { deploymentId: string }) {
  const filters = useListFilters();
  const trigger = filters.params.get("trigger");
  const result = filters.params.get("result");
  const triggerType =
    trigger === "manual" || trigger === "schedule" ? trigger : undefined;
  const hasError =
    result === "failed" ? true : result === "succeeded" ? false : undefined;
  const pager = useCursorPage(`${deploymentId}|${triggerType}|${hasError}`);
  const query = useDeploymentRuns({
    deployment_id: deploymentId,
    trigger_type: triggerType,
    has_error: hasError,
    page: pager.page,
  });
  const rows = query.data?.data ?? [];
  const selected = filters.params.get("run");
  const index = rows.findIndex((run) => run.id === selected);
  const lookup = useRef<HTMLInputElement>(null);
  const select = (id: string) => filters.update({ run: id });
  return (
    <section
      data-testid="deployment-runs"
      className="min-h-0 flex-1 overflow-auto"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ExactResourceLookup
          resource="run"
          path={`/deployments/${deploymentId}/runs`}
          inputRef={lookup}
          onOpen={select}
        />
        <Select
          value={triggerType ?? "all"}
          onValueChange={(value) =>
            filters.update({
              trigger: value && value !== "all" ? value : null,
              run: null,
            })
          }
        >
          <SelectTrigger
            aria-label="Trigger filter"
            className="h-8"
            data-trigger-filter={triggerType ?? "all"}
          >
            <SelectValue>
              {triggerType === "manual"
                ? "Manual"
                : triggerType === "schedule"
                  ? "Schedule"
                  : "Trigger All"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Trigger All</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="schedule">Schedule</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={
            hasError === undefined ? "all" : hasError ? "failed" : "succeeded"
          }
          onValueChange={(value) =>
            filters.update({
              result: value && value !== "all" ? value : null,
              run: null,
            })
          }
        >
          <SelectTrigger
            aria-label="Result filter"
            className="h-8"
            data-result-filter={
              hasError === undefined ? "all" : hasError ? "failed" : "succeeded"
            }
          >
            <SelectValue>
              {hasError === undefined
                ? "Result All"
                : hasError
                  ? "Failed"
                  : "Succeeded"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Result All</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Runs use saved configuration. Success means the Session was created;
        inspect it for execution status.
      </p>
      {query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <DataTable
            columns={RUN_COLUMNS}
            rows={rows}
            rowKey={(run) => run.id}
            activeRowKey={selected ?? undefined}
            loading={query.isPending}
            onRowClick={(run) => select(run.id)}
            empty={
              <EmptyState
                title="No runs yet"
                hint="Run this deployment to create its first session."
              />
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
      {selected && (
        <DeploymentRunInspector
          deploymentId={deploymentId}
          id={selected}
          previous={index > 0 ? rows[index - 1].id : undefined}
          next={index >= 0 ? rows[index + 1]?.id : undefined}
          onSelect={select}
          onClose={() => filters.update({ run: null })}
          fallbackFocus={lookup}
        />
      )}
    </section>
  );
}
