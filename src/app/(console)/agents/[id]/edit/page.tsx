"use client";

import { use } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/console/bits";
import { AgentEditor, formFromAgent } from "@/components/console/agent-editor";
import { useAgent } from "@/lib/platform/queries";

export default function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: agent, error, isPending } = useAgent(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !agent) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${agent.name}`}
        subtitle={`Editing v${agent.version} — saving creates v${agent.version + 1}.`}
      />
      <AgentEditor
        mode="edit"
        // Remount when a newer version loads so the form resets to it.
        key={`${agent.id}@${agent.version}`}
        initial={formFromAgent(agent)}
        agentId={agent.id}
        version={agent.version}
      />
    </div>
  );
}
