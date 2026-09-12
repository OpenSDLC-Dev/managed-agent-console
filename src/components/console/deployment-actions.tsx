"use client";

import { useRouter } from "next/navigation";
import { useLeaveConfirmation } from "@/components/shell/unsaved-changes";
import { Pause, Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceActions } from "@/components/console/resource-actions";
import {
  useArchiveDeployment,
  usePauseDeployment,
  useRunDeployment,
  useUnpauseDeployment,
} from "@/lib/platform/queries";
import type { Deployment, DeploymentRun } from "@/lib/platform/types";

export function DeploymentActions({
  deployment,
  onRun,
}: {
  deployment: Deployment;
  onRun?: (run: DeploymentRun) => void;
}) {
  const router = useRouter();
  const leave = useLeaveConfirmation();
  const archive = useArchiveDeployment(deployment.id);
  const pause = usePauseDeployment(deployment.id);
  const unpause = useUnpauseDeployment(deployment.id);
  const run = useRunDeployment(deployment.id);
  const archived = !!deployment.archived_at;

  return (
    <span className="flex items-center gap-2">
      {!archived && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: (created) =>
                  onRun
                    ? onRun(created)
                    : router.push(
                        `/deployments/${deployment.id}/runs/${created.id}`,
                      ),
              })
            }
          >
            <Play className="size-4" /> Run now
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={pause.isPending || unpause.isPending}
            onClick={() =>
              deployment.status === "paused" ? unpause.mutate() : pause.mutate()
            }
          >
            {deployment.status === "paused" ? (
              <RotateCw className="size-4" />
            ) : (
              <Pause className="size-4" />
            )}
            {deployment.status === "paused" ? "Resume" : "Pause"}
          </Button>
        </>
      )}
      <ResourceActions
        resource="deployment"
        archived={archived}
        archiveWarning="It can no longer be paused, resumed, edited, or run."
        onArchive={
          archived
            ? undefined
            : () => leave.requestLeave(() => archive.mutate())
        }
        archivePending={archive.isPending}
      />
    </span>
  );
}
