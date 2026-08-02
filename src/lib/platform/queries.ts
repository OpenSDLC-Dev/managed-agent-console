"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  platformDelete,
  platformGet,
  platformPost,
  platformPostForm,
  type ClassicPage,
  type Page,
} from "./http";
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
  limit?: number;
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
  limit?: number;
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
  limit?: number;
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
  limit?: number;
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

export interface AgentWriteBody {
  name?: string;
  model?: unknown;
  system?: string | null;
  description?: string;
  tools?: unknown[];
  mcp_servers?: unknown[];
  skills?: unknown[];
  metadata?: Record<string, string>;
  version?: number;
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentWriteBody) =>
      platformPost<Agent>("v1/agents", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useUpdateAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentWriteBody) =>
      platformPost<Agent>(`v1/agents/${id}`, body),
    onSuccess: (agent) => {
      queryClient.setQueryData(["agent", id], agent);
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
      void queryClient.invalidateQueries({ queryKey: ["agent-versions", id] });
    },
  });
}

export function useArchiveAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => platformPost<Agent>(`v1/agents/${id}/archive`, {}),
    onSuccess: (agent) => {
      queryClient.setQueryData(["agent", id], agent);
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export interface EnvironmentWriteBody {
  name?: string;
  description?: string;
  config?: unknown;
  metadata?: Record<string, string>;
}

export function useCreateEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EnvironmentWriteBody) =>
      platformPost<Environment>("v1/environments", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export function useUpdateEnvironment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EnvironmentWriteBody) =>
      platformPost<Environment>(`v1/environments/${id}`, body),
    onSuccess: (environment) => {
      queryClient.setQueryData(["environment", id], environment);
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export function useArchiveEnvironment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      platformPost<Environment>(`v1/environments/${id}/archive`, {}),
    onSuccess: (environment) => {
      queryClient.setQueryData(["environment", id], environment);
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export function useDeleteEnvironment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      platformDelete<{ id: string; type: string }>(`v1/environments/${id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["environment", id] });
      void queryClient.invalidateQueries({ queryKey: ["environments"] });
    },
  });
}

export interface SessionCreateBody {
  agent: string | { type: "agent"; id: string; version?: number };
  environment_id: string;
  title?: string;
  vault_ids?: string[];
  resources?: { type: "file"; file_id: string; mount_path?: string }[];
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionCreateBody) =>
      platformPost<Session>("v1/sessions", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return platformPostForm<PlatformFile>("v1/files", form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}
