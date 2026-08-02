"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { platformGet, platformPost, type ClassicPage, type Page } from "./http";
import type {
  Agent,
  Environment,
  PlatformFile,
  Session,
  SessionEvent,
  SessionStatus,
  Skill,
  SkillVersion,
  Vault,
  VaultCredential,
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
 * Send events into a session's log (user.message, user.tool_confirmation,
 * user.interrupt). The SSE trace picks up the results; only the session
 * object (status, usage) needs invalidating.
 */
export function useSendEvents(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (events: object[]) =>
      platformPost<{ data: SessionEvent[] }>(
        `v1/sessions/${sessionId}/events`,
        { events },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
}

export function useVaults(params: {
  page?: string;
  include_archived?: boolean;
}) {
  return useQuery({
    queryKey: ["vaults", params],
    queryFn: () =>
      platformGet<Page<Vault>>("v1/vaults", { limit: 20, ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useVault(id: string) {
  return useQuery({
    queryKey: ["vault", id],
    queryFn: () => platformGet<Vault>(`v1/vaults/${id}`),
  });
}

export function useVaultCredentials(vaultId: string, page?: string) {
  return useQuery({
    queryKey: ["vault-credentials", vaultId, page],
    queryFn: () =>
      platformGet<Page<VaultCredential>>(`v1/vaults/${vaultId}/credentials`, {
        limit: 20,
        page,
        include_archived: true,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useSkills(params: {
  page?: string;
  source?: "custom" | "anthropic";
}) {
  return useQuery({
    queryKey: ["skills", params],
    queryFn: () =>
      platformGet<Page<Skill>>("v1/skills", { limit: 20, ...params }),
    placeholderData: keepPreviousData,
  });
}

export function useSkill(id: string) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => platformGet<Skill>(`v1/skills/${id}`),
  });
}

export function useSkillVersions(id: string, page?: string) {
  return useQuery({
    queryKey: ["skill-versions", id, page],
    queryFn: () =>
      platformGet<Page<SkillVersion>>(`v1/skills/${id}/versions`, {
        limit: 20,
        page,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useFiles(afterId?: string) {
  return useQuery({
    queryKey: ["files", afterId],
    queryFn: () =>
      platformGet<ClassicPage<PlatformFile>>("v1/files", {
        limit: 20,
        after_id: afterId,
      }),
    placeholderData: keepPreviousData,
  });
}
