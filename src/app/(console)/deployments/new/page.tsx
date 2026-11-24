"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import {
  DeploymentEditor,
  newDeploymentForm,
} from "@/components/console/deployment-editor";

export default function NewDeploymentPage() {
  const params = useSearchParams();
  const agent = params.get("agent") ?? "";
  const version = Number(params.get("version"));
  const environment = params.get("environment") ?? "";
  return (
    <div>
      <PageHeader
        title="Create deployment"
        subtitle="Pin an agent and configure how it starts."
      />
      <DeploymentEditor
        key={JSON.stringify([agent, version, environment])}
        mode="create"
        initial={{
          ...newDeploymentForm(),
          agentId: agent,
          agentVersion:
            agent && Number.isSafeInteger(version) && version > 0
              ? version
              : undefined,
          environmentId: environment,
        }}
      />
    </div>
  );
}
