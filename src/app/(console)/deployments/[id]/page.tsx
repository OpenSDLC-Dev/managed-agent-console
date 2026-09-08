"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { DeploymentActions } from "@/components/console/deployment-actions";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import { IdCell } from "@/components/console/copy-id";
import {
  DetailSection,
  Field,
  FieldList,
  JsonBlock,
} from "@/components/console/detail";
import {
  ArchivedBadge,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  StatusBadge,
  Time,
} from "@/components/console/bits";
import { useDeployment, useDeploymentRuns } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { DeploymentRun } from "@/lib/platform/types";

const RUN_COLUMNS: Column<DeploymentRun>[] = [
  { key: "id", header: "Run", cell: (run) => <IdCell id={run.id} /> },
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
    key: "trigger",
    header: "Trigger",
    cell: (run) =>
      run.trigger_context.type === "manual" ? "Manual" : "Schedule",
  },
  {
    key: "session",
    header: "Session",
    cell: (run) =>
      run.session_id ? (
        <Link
          className="font-mono text-[13px] hover:underline"
          href={`/sessions/${run.session_id}`}
        >
          {run.session_id}
        </Link>
      ) : (
        "—"
      ),
  },
  {
    key: "created",
    header: "Created",
    cell: (run) => <Time iso={run.created_at} />,
  },
];

export default function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const deployment = useDeployment(id);
  const pager = useCursorPage(id);
  const runs = useDeploymentRuns({ deployment_id: id, page: pager.page });
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  if (deployment.error) return <ErrorState error={deployment.error} />;
  if (deployment.isPending || !deployment.data) return <DetailSkeleton />;
  const item = deployment.data;
  const upcoming = item.schedule?.upcoming_runs_at ?? [];

  return (
    <div>
      <Breadcrumb
        parent={{ href: "/deployments", label: "Deployments" }}
        current={item.name}
      />
      <PageHeader
        title={item.name}
        subtitle={item.description || undefined}
        actions={
          <span className="flex items-center gap-2">
            <ArchivedBadge archivedAt={item.archived_at} />
            {!item.archived_at && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => router.push(`/deployments/${id}/edit`)}
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            <DeploymentActions deployment={item} />
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={item.id} />
          </Field>
          <Field label="Status">
            <span data-status={item.archived_at ? "archived" : item.status}>
              <StatusBadge
                status={item.archived_at ? "archived" : item.status}
              />
            </span>
          </Field>
          {item.paused_reason && (
            <Field label="Paused reason">
              <span data-paused-reason={item.paused_reason.type}>
                {item.paused_reason.type === "manual"
                  ? "Manual"
                  : item.paused_reason.error.type}
              </span>
            </Field>
          )}
          <Field label="Agent">
            <Link className="hover:underline" href={`/agents/${item.agent.id}`}>
              {item.agent.id} · v{item.agent.version}
            </Link>
          </Field>
          <Field label="Environment">
            <Link
              className="hover:underline"
              href={`/environments/${item.environment_id}`}
            >
              {item.environment_id}
            </Link>
          </Field>
          <Field label="Vaults">
            {item.vault_ids.length ? item.vault_ids.join(", ") : "—"}
          </Field>
          <Field label="Created">
            <Time iso={item.created_at} />
          </Field>
          <Field label="Updated">
            <Time iso={item.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Schedule" testId="deployment-schedule">
        {item.schedule ? (
          <FieldList>
            <Field label="Cron">
              <span className="font-mono">{item.schedule.expression}</span>
            </Field>
            <Field label="Timezone">{item.schedule.timezone}</Field>
            <Field label="Last run">
              <Time iso={item.schedule.last_run_at} />
            </Field>
            <Field label="Upcoming">
              <span className="space-x-2" data-upcoming-count={upcoming.length}>
                {(showAllUpcoming ? upcoming : upcoming.slice(0, 3)).map(
                  (time) => (
                    <Badge key={time} variant="outline" className="font-normal">
                      <Time iso={time} />
                    </Badge>
                  ),
                )}
                {upcoming.length === 0 && "—"}
                {upcoming.length > 3 && (
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => setShowAllUpcoming((value) => !value)}
                  >
                    {showAllUpcoming
                      ? "Show less"
                      : `Show ${upcoming.length - 3} more`}
                  </Button>
                )}
              </span>
            </Field>
          </FieldList>
        ) : (
          <p className="text-sm text-muted-foreground">Manual runs only.</p>
        )}
      </DetailSection>
      <DetailSection title="Initial events">
        <JsonBlock value={item.initial_events} />
      </DetailSection>
      {item.resources.length > 0 && (
        <DetailSection title="Resources">
          <JsonBlock value={item.resources} />
        </DetailSection>
      )}
      {Object.keys(item.metadata).length > 0 && (
        <DetailSection title="Metadata">
          <JsonBlock value={item.metadata} />
        </DetailSection>
      )}
      <DetailSection title="Run history" testId="deployment-runs">
        {runs.error ? (
          <ErrorState error={runs.error} />
        ) : (
          <>
            <DataTable
              columns={RUN_COLUMNS}
              rows={runs.data?.data ?? []}
              rowKey={(run) => run.id}
              loading={runs.isPending}
              onRowClick={(run) =>
                router.push(`/deployments/${id}/runs/${run.id}`)
              }
              empty={
                <EmptyState
                  title="No runs yet"
                  hint="Run this deployment to create its first session."
                />
              }
            />
            <Pager
              hasPrev={pager.hasPrev}
              hasNext={!!runs.data?.next_page}
              onPrev={pager.goPrev}
              onNext={() =>
                runs.data?.next_page && pager.goNext(runs.data.next_page)
              }
            />
          </>
        )}
      </DetailSection>
    </div>
  );
}
