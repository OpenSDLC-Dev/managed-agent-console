"use client";

import { use, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState, DetailSkeleton } from "@/components/console/bits";
import { AgentEditor, formFromAgent } from "@/components/console/agent-editor";
import type { Agent } from "@/lib/platform/types";
import { useAgent } from "@/lib/platform/queries";

export default function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: agent, error, isPending, refetch } = useAgent(id);

  if (error && !agent) return <ErrorState error={error} />;
  if (isPending || !agent) {
    return <DetailSkeleton />;
  }

  return <LoadedEditor key={agent.id} agent={agent} refetch={refetch} />;
}

function LoadedEditor({
  agent,
  refetch,
}: {
  agent: Agent;
  refetch: () => Promise<{ data?: Agent; error: unknown }>;
}) {
  // Keep the draft and its optimistic version together across background refreshes.
  const [editing, setEditing] = useState(agent);
  return (
    <div>
      <PageHeader
        title={`Edit ${editing.name}`}
        subtitle={`Editing v${editing.version} — saving creates v${editing.version + 1}.`}
      />
      <AgentEditor
        mode="edit"
        // Remount only after the operator confirms replacing the draft.
        key={`${editing.id}@${editing.version}`}
        initial={formFromAgent(editing)}
        agentId={editing.id}
        version={editing.version}
        onReload={async () => {
          const latest = await refetch();
          if (!latest.error && latest.data) setEditing(latest.data);
        }}
      />
    </div>
  );
}
