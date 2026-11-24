"use client";

import { useQuery } from "@tanstack/react-query";
import { nativeGet, ORGANIZATION } from "./native";
import { CONSOLE_WORKSPACE } from "./tenancy";

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
  return useQuery({
    queryKey: ["agents-overview", sort, direction, agentId],
    queryFn: ({ signal }) =>
      nativeGet<AgentsOverviewReport>(
        ORGANIZATION + "/workspaces/" + CONSOLE_WORKSPACE + "/agents/overview",
        { sort, direction, agent_id: agentId },
        signal,
      ),
    placeholderData: (previous, query) =>
      query?.queryKey[3] === agentId ? previous : undefined,
    retry: false,
  });
}
