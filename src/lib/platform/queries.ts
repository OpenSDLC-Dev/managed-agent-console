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
 * Incremental tail cache: each poll resumes from the cursor of the last page
 * it fetched instead of re-walking the whole log (the log is append-only, so
 * re-fetching the final page plus id-dedup covers the overlap). SSE tailing
 * replaces the poll in slice 3. Bounded LRU so histories from visited
 * sessions don't accumulate for the browser process's lifetime.
 */
type EventTail = { pageCursor: string | undefined; events: SessionEvent[] };

const EVENT_TAIL_LIMIT = 20;
const eventTails = new Map<string, EventTail>();

function tailGet(key: string): EventTail | undefined {
  const value = eventTails.get(key);
  if (value) {
    // Refresh recency: Map iterates in insertion order.
    eventTails.delete(key);
    eventTails.set(key, value);
  }
  return value;
}

function tailSet(key: string, value: EventTail): void {
  eventTails.delete(key);
  eventTails.set(key, value);
  while (eventTails.size > EVENT_TAIL_LIMIT) {
    eventTails.delete(eventTails.keys().next().value as string);
  }
}

/**
 * Event log via polling (ascending, newest last). The poll interval tightens
 * while the session is running.
 */
export function useSessionEvents(
  id: string,
  options: { running: boolean; types?: string[] },
) {
  const cacheKey = `${id}|${(options.types ?? []).join(",")}`;
  return useQuery({
    queryKey: ["session-events", id, options.types],
    queryFn: async () => {
      const cached = tailGet(cacheKey) ?? {
        pageCursor: undefined,
        events: [],
      };
      const seen = new Set(cached.events.map((event) => event.id));
      const events = [...cached.events];
      let page = cached.pageCursor;
      // The platform caps event pages at 1000; follow next_page to the tip.
      for (;;) {
        const result = await platformGet<Page<SessionEvent>>(
          `v1/sessions/${id}/events`,
          { limit: 1000, order: "asc", page, types: options.types },
        );
        for (const event of result.data) {
          if (!seen.has(event.id)) {
            seen.add(event.id);
            events.push(event);
          }
        }
        if (!result.next_page) break;
        page = result.next_page;
      }
      tailSet(cacheKey, { pageCursor: page, events });
      return events;
    },
    refetchInterval: options.running ? 3_000 : 15_000,
  });
}
