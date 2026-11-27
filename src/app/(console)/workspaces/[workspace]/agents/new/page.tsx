import { surfacePaths } from "@/lib/routes";
import { AgentCreateForm } from "@/components/console/agent-create-form";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { PageHeader } from "@/components/shell/page-header";

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[] }>;
}) {
  const { model } = await searchParams;
  const selected = Array.isArray(model) ? model[0] : model;
  return (
    <div className="-my-6 flex min-h-[calc(100dvh-var(--console-header-height))] flex-col">
      <div className="-mx-1 pt-4 sm:-mx-5">
        <Breadcrumb
          parent={{ href: surfacePaths.agents, label: "Agents" }}
          current="New agent"
        />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col pt-3">
        <PageHeader
          title="Create agent"
          subtitle="Start from a template or describe what you need."
          className="pb-11 [&>div]:w-full"
        />
        <AgentCreateForm key={selected} initialModel={selected} />
      </div>
    </div>
  );
}
