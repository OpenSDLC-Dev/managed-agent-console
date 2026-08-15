"use client";

import { PageHeader } from "@/components/shell/page-header";
import { AgentCreateForm } from "@/components/console/agent-create-form";

export default function NewAgentPage() {
  return (
    <div>
      <PageHeader
        title="Create agent"
        subtitle="Configure a new autonomous agent."
      />
      <AgentCreateForm />
    </div>
  );
}
