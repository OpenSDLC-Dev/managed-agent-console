"use client";

import { useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { agentsReportAccessKey, isUnimplemented } from "./surfaces";
import { isPermissionDenied } from "./denied";
import { PlatformError } from "./http";
import { nativeGet, ORGANIZATION } from "./native";
import { tabWorkspace } from "./tenancy";

// Private DTO and sort contract: managed-agent-platform/internal/api/agentsoverview.sql.
export type OverviewSort = "name" | "sessions" | "error_rate" | "last_active";
export type OverviewDirection = "asc" | "desc";
export interface AgentActivity {
  id: string;
  name: string;
  archived_at: string | null;
  sessions: number;
  error_rate: number;
  median_seconds: number | null;
  last_active: string | null;
}
export interface AgentsOverviewReport {
  summary: {
    sessions: number;
    agents: number;
    error_rate: number;
    session_change: number | null;
    error_change: number | null;
  };
  days: string[];
  series: { id: string | null; name: string; counts: number[] }[];
  active_time: AgentActivity[];
  agents: AgentActivity[];
  total: number;
}
export function useAgentsOverview(
  sort: OverviewSort,
  direction: OverviewDirection,
  agentId?: string,
) {
  const session = useContext(ConsoleSessionContext)?.data;
  const client = useQueryClient();
  const accessKey = agentsReportAccessKey(session);
  return useQuery({
    queryKey: [
      "agents-overview",
      sort,
      direction,
      agentId,
      ...accessKey.slice(1),
    ],
    queryFn: async ({ signal }) => {
      try {
        const report = await nativeGet<AgentsOverviewReport>(
          ORGANIZATION + "/workspaces/" + tabWorkspace() + "/agents/overview",
          { sort, direction, agent_id: agentId },
          signal,
        );
        client.setQueryData(accessKey, { status: "available" });
        return report;
      } catch (error) {
        if (isUnimplemented(error))
          client.setQueryData(accessKey, { status: "unimplemented" });
        else if (error instanceof PlatformError && isPermissionDenied(error))
          client.setQueryData(accessKey, { status: "denied", error });
        throw error;
      }
    },
    placeholderData: (previous, query) =>
      query &&
      query.queryKey[3] === agentId &&
      query.queryKey[4] === session?.id &&
      query.queryKey[5] === session?.role &&
      query.queryKey[6] === session?.platform_version
        ? previous
        : undefined,
    retry: false,
  });
}
