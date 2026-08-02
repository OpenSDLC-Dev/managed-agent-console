"use client";

import { use } from "react";
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
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import { useAgent, useAgentVersions } from "@/lib/platform/queries";
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
    cell: (v) => <Time iso={v.updated_at} />,
  },
];

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: agent, error, isPending } = useAgent(id);
  const versions = useAgentVersions(id);

  if (error) return <ErrorState error={error} />;
  if (isPending || !agent) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div>
      <PageHeader
        title={agent.name}
        subtitle={agent.description || undefined}
        actions={<ArchivedBadge archivedAt={agent.archived_at} />}
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
            <Time iso={agent.created_at} />
          </Field>
          <Field label="Last updated">
            <Time iso={agent.updated_at} />
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
