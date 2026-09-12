"use client";

import type { ComponentProps } from "react";
import { useDeploymentRun } from "@/lib/platform/queries";
import { PlatformError } from "@/lib/platform/http";
import { ResourceInspector } from "./resource-inspector";
import { SessionSummary } from "./session-inspector";
import { DetailSkeleton, ErrorState } from "./bits";
import { DeploymentRunDetails } from "./deployment-run-details";

export function DeploymentRunInspector({
  deploymentId,
  ...props
}: Omit<ComponentProps<typeof ResourceInspector>, "kind" | "children"> & {
  deploymentId: string;
}) {
  const query = useDeploymentRun(props.id);
  const run =
    query.data?.deployment_id === deploymentId ? query.data : undefined;
  const error =
    query.error ??
    (query.data && !run
      ? new PlatformError(404, {
          type: "error",
          error: {
            type: "not_found_error",
            message: "Deployment run not found in this deployment.",
          },
        })
      : null);
  return (
    <ResourceInspector
      {...props}
      kind={run?.session_id ? "session" : "deployment-run"}
      id={run?.session_id ?? props.id}
    >
      {error ? (
        <ErrorState error={error} />
      ) : !run ? (
        <DetailSkeleton />
      ) : run.session_id ? (
        <SessionSummary
          key={run.id}
          id={run.session_id}
          onDeleted={props.onClose}
          run={run}
        />
      ) : (
        <div className="overflow-y-auto">
          <DeploymentRunDetails run={run} includeApi />
        </div>
      )}
    </ResourceInspector>
  );
}
