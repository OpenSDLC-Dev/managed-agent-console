import { PageHeader } from "@/components/shell/page-header";
import { AgentCreateForm } from "@/components/console/agent-create-form";

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[] }>;
}) {
  const { model } = await searchParams;
  const selected = Array.isArray(model) ? model[0] : model;
  return (
    <div>
      <PageHeader
        title="Create agent"
        subtitle="Configure a new autonomous agent."
      />
      <AgentCreateForm key={selected} initialModel={selected} />
    </div>
  );
}
