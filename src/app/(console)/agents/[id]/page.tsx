"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArchiveButton } from "@/components/console/archive-button";
import { PageHeader } from "@/components/shell/page-header";
import {
  DetailSection,
  Field,
  FieldList,
  JsonBlock,
} from "@/components/console/detail";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  ArchivedBadge,
  Day,
  EmptyState,
  ErrorState,
  IdCode,
  DetailSkeleton,
} from "@/components/console/bits";
import {
  useAgent,
  useAgentVersions,
  useArchiveAgent,
} from "@/lib/platform/queries";
import type { Agent } from "@/lib/platform/types";

const VERSION_COLUMNS: Column<Agent>[] = [
  { key: "version", header: "Version", cell: (v) => `v${v.version}` },
  {
    key: "model",
    header: "Model",
    className: "w-full",
    cell: (v) => <span className="font-mono text-[13px]">{v.model.id}</span>,
  },
  {
    key: "created",
    header: "Created",
    cell: (v) => <Day iso={v.updated_at} />,
  },
];

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: agent, error, isPending } = useAgent(id);
  const versions = useAgentVersions(id);
  const archive = useArchiveAgent(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !agent) {
    return <DetailSkeleton />;
  }

  return (
    <div>
      <PageHeader
        title={agent.name}
        subtitle={agent.description || undefined}
        actions={
          <span className="flex items-center gap-2">
            <ArchivedBadge archivedAt={agent.archived_at} />
            {!agent.archived_at && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => router.push(`/agents/${agent.id}/edit`)}
                >
                  <Pencil className="size-4" /> Edit
                </Button>
                <ArchiveButton
                  resource="agent"
                  onConfirm={() => archive.mutate()}
                  pending={archive.isPending}
                />
              </>
            )}
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCode id={agent.id} />
          </Field>
          <Field label="Model">
            <span className="font-mono text-[13px]">
              {agent.model.id}
              {agent.model.speed ? ` · ${agent.model.speed}` : ""}
            </span>
          </Field>
          <Field label="Current version">v{agent.version}</Field>
          <Field label="Created">
            <Day iso={agent.created_at} />
          </Field>
          <Field label="Last updated">
            <Day iso={agent.updated_at} />
          </Field>
        </FieldList>
      </DetailSection>
      {agent.system && (
        <DetailSection title="System prompt">
          <pre className="whitespace-pre-wrap rounded-lg border bg-card p-3 text-[13px] leading-relaxed">
            {agent.system}
          </pre>
        </DetailSection>
      )}
      <DetailSection title="Tools">
        <JsonBlock value={agent.tools} />
      </DetailSection>
      {agent.skills.length > 0 && (
        <DetailSection title="Skills">
          <JsonBlock value={agent.skills} />
        </DetailSection>
      )}
      {agent.mcp_servers.length > 0 && (
        <DetailSection title="MCP servers">
          <JsonBlock value={agent.mcp_servers} />
        </DetailSection>
      )}
      <DetailSection title="Versions">
        {versions.error ? (
          <ErrorState error={versions.error} />
        ) : (
          <DataTable
            columns={VERSION_COLUMNS}
            rows={versions.data?.data ?? []}
            rowKey={(v) => String(v.version)}
            loading={versions.isPending}
            empty={<EmptyState title="No versions" />}
          />
        )}
      </DetailSection>
    </div>
  );
}
