"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { platformGet, type Page } from "./http";
import type {
  Agent,
  Environment,
  Session,
  SessionEvent,
  SessionStatus,
} from "./types";

export function useAgents(params: {
  page?: string;
  include_archived?: boolean;
}) {
  return useQuery({
    queryKey: ["agents", params],
    queryFn: () =>
      platformGet<Page<Agent>>("v1/agents", { limit: 20, ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => platformGet<Agent>(`v1/agents/${id}`),
  });
}

export function useAgentVersions(id: string, page?: string) {
  return useQuery({
    queryKey: ["agent-versions", id, page],
    queryFn: () =>
      platformGet<Page<Agent>>(`v1/agents/${id}/versions`, {
        limit: 20,
        page,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useEnvironments(params: {
  page?: string;
  include_archived?: boolean;
}) {
  return useQuery({
    queryKey: ["environments", params],
    queryFn: () =>
      platformGet<Page<Environment>>("v1/environments", {
        limit: 20,
        ...params,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useEnvironment(id: string) {
  return useQuery({
    queryKey: ["environment", id],
    queryFn: () => platformGet<Environment>(`v1/environments/${id}`),
  });
}

export function useSessions(params: {
  page?: string;
  statuses?: SessionStatus[];
  agent_id?: string;
  order?: "asc" | "desc";
  include_archived?: boolean;
}) {
  return useQuery({
    queryKey: ["sessions", params],
    queryFn: () =>
      platformGet<Page<Session>>("v1/sessions", {
        limit: 20,
        ...params,
        statuses: params.statuses,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useSession(id: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => platformGet<Session>(`v1/sessions/${id}`),
    refetchInterval,
  });
}

/**
 * Event log via polling (ascending, newest last). SSE tailing arrives with
 * slice 3; the poll interval tightens while the session is running.
 */
export function useSessionEvents(
  id: string,
  options: { running: boolean; types?: string[] },
) {
  return useQuery({
    queryKey: ["session-events", id, options.types],
    queryFn: async () => {
      const events: SessionEvent[] = [];
      let page: string | undefined;
      // The platform caps event pages at 1000; follow next_page to the tip.
      for (;;) {
        const result = await platformGet<Page<SessionEvent>>(
          `v1/sessions/${id}/events`,
          { limit: 1000, order: "asc", page, types: options.types },
        );
        events.push(...result.data);
        if (!result.next_page) break;
        page = result.next_page;
      }
      return events;
    },
    refetchInterval: options.running ? 3_000 : 15_000,
  });
}
