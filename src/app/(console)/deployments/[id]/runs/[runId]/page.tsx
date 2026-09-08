"use client";

import { use } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { IdCell } from "@/components/console/copy-id";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { DetailSkeleton, ErrorState, Time } from "@/components/console/bits";
import { useDeploymentRun } from "@/lib/platform/queries";

export default function DeploymentRunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = use(params);
  const query = useDeploymentRun(runId);
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  const run = query.data;
  return (
    <div>
      <Breadcrumb
        parent={{ href: `/deployments/${id}`, label: "Deployment" }}
        current={run.id}
      />
      <PageHeader
        title="Deployment run"
        subtitle={run.id}
        actions={
          <Badge
            variant="outline"
            data-run-result={run.error ? "failed" : "succeeded"}
          >
            {run.error ? "failed" : "succeeded"}
          </Badge>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={run.id} />
          </Field>
          <Field label="Deployment">
            <Link
              className="hover:underline"
              href={`/deployments/${run.deployment_id}`}
            >
              {run.deployment_id}
            </Link>
          </Field>
          <Field label="Trigger">
            <span data-trigger-type={run.trigger_context.type}>
              {run.trigger_context.type === "manual" ? (
                "Manual"
              ) : (
                <>
                  <Time iso={run.trigger_context.scheduled_at} /> · schedule
                </>
              )}
            </span>
          </Field>
          <Field label="Agent">
            <Link className="hover:underline" href={`/agents/${run.agent.id}`}>
              {run.agent.id} · v{run.agent.version}
            </Link>
          </Field>
          <Field label="Session">
            {run.session_id ? (
              <Link
                className="hover:underline"
                href={`/sessions/${run.session_id}`}
              >
                {run.session_id}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Created">
            <Time iso={run.created_at} />
          </Field>
        </FieldList>
      </DetailSection>
      {run.error && (
        <DetailSection title="Error" testId="deployment-run-error">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">{run.error.type}</p>
            <p className="text-muted-foreground">{run.error.message}</p>
          </div>
        </DetailSection>
      )}
    </div>
  );
}
