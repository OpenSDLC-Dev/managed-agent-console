"use client";

import { PageHeader } from "@/components/shell/page-header";
import { AgentEditor, newAgentForm } from "@/components/console/agent-editor";

export default function NewAgentPage() {
  return (
    <div>
      <PageHeader
        title="Create agent"
        subtitle="Configure a new autonomous agent."
      />
      <AgentEditor mode="create" initial={newAgentForm()} />
    </div>
  );
}
