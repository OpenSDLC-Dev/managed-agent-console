"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSkeleton, ErrorState } from "@/components/console/bits";
import {
  DeploymentEditor,
  formFromDeployment,
} from "@/components/console/deployment-editor";
import { useDeployment } from "@/lib/platform/queries";

export default function EditDeploymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = useDeployment(id);
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  return (
    <div>
      <PageHeader
        title={`Edit ${query.data.name}`}
        subtitle="Changes apply to future runs."
      />
      <DeploymentEditor
        key={query.data.updated_at}
        mode="edit"
        initial={formFromDeployment(query.data)}
        deploymentId={id}
      />
    </div>
  );
}
