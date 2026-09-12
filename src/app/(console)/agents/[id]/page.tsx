"use client";
import { Suspense, use, useState, type ReactNode } from "react";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { Button } from "@/components/ui/button";
import { CreateSessionButton } from "@/components/console/create-session-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CopyIdButton } from "@/components/console/copy-id";
import {
  DetailSkeleton,
  ErrorState,
  Time,
  Day,
} from "@/components/console/bits";
import { AgentActions } from "@/components/console/agent-inspector";
import { AgentEditor, formFromAgent } from "@/components/console/agent-editor";
import {
  AgentSessions,
  AgentDeployments,
} from "@/components/console/agent-related";
import {
  useAgent,
  useAgentVersion,
  useAgentVersionOptions,
} from "@/lib/platform/queries";
import { useListFilters } from "@/lib/use-list-filters";
import { useLeaveConfirmation } from "@/components/shell/unsaved-changes";
import type { Agent } from "@/lib/platform/types";

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <AgentWorkspace id={id} />
    </Suspense>
  );
}
function AgentWorkspace({ id }: { id: string }) {
  const filters = useListFilters();
  const version = filters.params.get("version") || null;
  const tab = filters.params.get("tab");
  const leave = useLeaveConfirmation();
  const query = useAgent(id);
  const historical = useAgentVersion(id, version);
  if (query.error && !query.data) return <ErrorState error={query.error} />;
  if (!query.data) return <DetailSkeleton />;
  const agent = query.data;
  const selected = version ? historical.data : agent;
  const selector = (
    <AgentVersionPicker
      id={id}
      head={agent.version}
      selected={version}
      onSelect={(value) =>
        leave.requestLeave(() => filters.update({ version: value }))
      }
    />
  );
  const changeTab = (value: string) =>
    leave.requestLeave(() =>
      filters.update({ tab: value === "configuration" ? null : value }),
    );
  return (
    <div className="flex h-[calc(100dvh-64px)] min-h-[480px] flex-col">
      <div className="shrink-0 pb-4">
        <Breadcrumb
          parent={{ href: "/agents", label: "Agents" }}
          current={agent.name}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bot className="size-5 shrink-0" />
              <h1 className="min-w-0 break-words text-2xl font-semibold">
                {agent.name}
              </h1>
              <Badge
                variant="secondary"
                data-status={agent.archived_at ? "archived" : "active"}
              >
                {agent.archived_at ? "Archived" : "Active"}
              </Badge>
            </div>
            {agent.description && (
              <p className="pt-2 text-sm">{agent.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <code className="break-all">{agent.id}</code>
                <CopyIdButton id={agent.id} />
              </span>
              <span>
                Last updated <Time iso={agent.updated_at} />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!agent.archived_at && selected && (
              <CreateSessionButton variant="outline" initialAgent={selected} />
            )}
            <AgentActions agent={agent} />
          </div>
        </div>
      </div>
      <nav
        aria-label="Agent sections"
        className="mb-4 flex shrink-0 gap-1 overflow-x-auto border-b"
      >
        {["configuration", "sessions", "deployments"].map((value) => (
          <button
            key={value}
            onClick={() => changeTab(value)}
            aria-current={
              tab === value ||
              (value === "configuration" &&
                tab !== "sessions" &&
                tab !== "deployments")
                ? "page"
                : undefined
            }
            className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm capitalize text-muted-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
          >
            {value}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1">
        {tab === "sessions" ? (
          <div className="h-full overflow-y-auto">
            <div className="mb-4">{selector}</div>
            <AgentSessions id={id} version={version} />
          </div>
        ) : tab === "deployments" ? (
          <div className="h-full overflow-y-auto">
            <AgentDeployments id={id} />
          </div>
        ) : historical.error && version ? (
          <>
            <div className="mb-4">{selector}</div>
            <ErrorState error={historical.error} />
          </>
        ) : !selected ? (
          <DetailSkeleton />
        ) : (
          <AgentConfiguration
            key={id + ":" + (version ?? "latest")}
            agent={selected}
            readOnly={!!version || !!agent.archived_at}
            toolbar={(editingVersion, reload) => (
              <AgentVersionPicker
                id={id}
                head={agent.version}
                selected={
                  version ??
                  (editingVersion !== agent.version
                    ? String(editingVersion)
                    : null)
                }
                onSelect={(value) =>
                  leave.requestLeave(() => {
                    if (value === null && version === null) void reload();
                    else filters.update({ version: value });
                  })
                }
              />
            )}
            refetch={query.refetch}
          />
        )}
      </div>
    </div>
  );
}
function AgentVersionPicker({
  id,
  head,
  selected,
  onSelect,
}: {
  id: string;
  head: number;
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  const query = useAgentVersionOptions(id);
  const versions = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Select
      value={selected ?? "latest"}
      onValueChange={(value) =>
        value && onSelect(value === "latest" ? null : value)
      }
    >
      <SelectTrigger aria-label="Agent version" className="h-8 w-fit min-w-44">
        <SelectValue>
          {selected ? (
            "Version: " + selected
          ) : (
            <span className="flex items-center gap-2">
              Version: {head}
              <Badge variant="secondary">Latest</Badge>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        className="min-w-64"
      >
        <SelectItem value="latest">v{head} Latest</SelectItem>
        {versions
          .filter((row) => row.version !== head)
          .map((row) => (
            <SelectItem key={row.version} value={String(row.version)}>
              v{row.version} · Created <Day iso={row.updated_at} />
            </SelectItem>
          ))}
        {query.error && (
          <div className="p-2">
            <ErrorState error={query.error} />
          </div>
        )}
        {query.hasNextPage && (
          <Button
            size="sm"
            variant="ghost"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load older versions
          </Button>
        )}
      </SelectContent>
    </Select>
  );
}
function AgentConfiguration({
  agent,
  readOnly,
  toolbar,
  refetch,
}: {
  agent: Agent;
  readOnly: boolean;
  toolbar: (version: number, reload: () => Promise<void>) => ReactNode;
  refetch: () => Promise<{ data?: Agent; error: unknown }>;
}) {
  const [editing, setEditing] = useState(agent);
  const [reset, setReset] = useState(0);
  const reload = async () => {
    const latest = await refetch();
    if (!latest.error && latest.data) {
      setEditing(latest.data);
      setReset((value) => value + 1);
    }
  };
  return (
    <AgentEditor
      key={editing.id + ":" + reset}
      mode="edit"
      inline
      readOnly={readOnly}
      initial={formFromAgent(editing)}
      agentId={editing.id}
      version={editing.version}
      toolbar={toolbar(editing.version, reload)}
      onReload={reload}
      onSaved={(saved) => {
        setEditing(saved);
        setReset((value) => value + 1);
        toast.success("Saved new agent version.");
      }}
    />
  );
}
