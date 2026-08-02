"use client";

import { PageHeader } from "@/components/shell/page-header";
import {
  EnvironmentEditor,
  newEnvForm,
} from "@/components/console/environment-editor";

export default function NewEnvironmentPage() {
  return (
    <div>
      <PageHeader
        title="Create environment"
        subtitle="A configuration template for session sandboxes."
      />
      <EnvironmentEditor mode="create" initial={newEnvForm()} />
    </div>
  );
}
