import Link from "next/link";
import type { DeploymentRun } from "@/lib/platform/types";
import { Field, JsonBlock } from "./detail";
import { IdCell } from "./copy-id";
import { Time } from "./bits";

export function deploymentRunSessionHref(run: DeploymentRun) {
  return `/sessions/${encodeURIComponent(run.session_id!)}?${new URLSearchParams({ from_deployment: run.deployment_id, from_run: run.id })}`;
}

export function DeploymentRunDetails({
  run,
  includeApi = false,
}: {
  run: DeploymentRun;
  includeApi?: boolean;
}) {
  const Heading = includeApi ? "h2" : "h3";
  return (
    <section className="space-y-3" data-run-id={run.id}>
      <Heading className="text-sm font-medium">Run</Heading>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-sm">
        <Field label="ID">
          <IdCell id={run.id} />
        </Field>
        <Field label="Trigger">
          <span data-trigger-type={run.trigger_context.type}>
            {run.trigger_context.type === "manual" ? "Manual" : "Schedule"}
          </span>
        </Field>
        {run.trigger_context.type === "schedule" && (
          <Field label="Scheduled at">
            <Time iso={run.trigger_context.scheduled_at} />
          </Field>
        )}
        <Field label="Started at">
          <Time iso={run.created_at} />
        </Field>
        <Field label="Agent version">
          <Link
            className="break-all hover:underline"
            href={`/agents/${encodeURIComponent(run.agent.id)}?version=${run.agent.version}`}
          >
            v{run.agent.version}
          </Link>
        </Field>
        <Field label="Result">
          <span data-run-result={run.error ? "failed" : "succeeded"}>
            {run.error ? "Failed" : "Session created"}
          </span>
        </Field>
      </dl>
      {run.error && (
        <div
          data-testid="deployment-run-error"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium">{run.error.type}</p>
          <p className="break-words">{run.error.message}</p>
        </div>
      )}
      {includeApi && (
        <details>
          <summary className="cursor-pointer text-xs">Run API response</summary>
          <JsonBlock value={run} />
        </details>
      )}
    </section>
  );
}
