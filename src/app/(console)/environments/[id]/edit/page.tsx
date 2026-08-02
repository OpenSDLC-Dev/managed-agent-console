"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState, DetailSkeleton } from "@/components/console/bits";
import {
  EnvironmentEditor,
  formFromEnvironment,
} from "@/components/console/environment-editor";
import { useEnvironment } from "@/lib/platform/queries";

export default function EditEnvironmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: environment, error, isPending } = useEnvironment(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !environment) {
    return <DetailSkeleton />;
  }

  return (
    <div>
      <PageHeader title={`Edit ${environment.name}`} />
      <EnvironmentEditor
        mode="edit"
        key={`${environment.id}@${environment.updated_at}`}
        initial={formFromEnvironment(environment)}
        environmentId={environment.id}
      />
    </div>
  );
}
