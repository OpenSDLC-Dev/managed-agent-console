"use client";

import { PageHeader } from "@/components/shell/page-header";
import {
  DeploymentEditor,
  newDeploymentForm,
} from "@/components/console/deployment-editor";

export default function NewDeploymentPage() {
  return (
    <div>
      <PageHeader
        title="Create deployment"
        subtitle="Pin an agent and configure how it starts."
      />
      <DeploymentEditor mode="create" initial={newDeploymentForm()} />
    </div>
  );
}
